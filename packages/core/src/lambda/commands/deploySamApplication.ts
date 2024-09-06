/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { asEnvironmentVariables } from '../../auth/credentials/utils'
import { AwsContext } from '../../shared/awsContext'
import globals from '../../shared/extensionGlobals'

import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import { checklogs } from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { SamCliSettings } from '../../shared/sam/cli/samCliSettings'
import { getSamCliContext, SamCliContext, getSamCliVersion } from '../../shared/sam/cli/samCliContext'
import { runSamCliDeploy } from '../../shared/sam/cli/samCliDeploy'
import { SamCliProcessInvoker } from '../../shared/sam/cli/samCliInvokerUtils'
import { runSamCliPackage } from '../../shared/sam/cli/samCliPackage'
import { throwAndNotifyIfInvalid } from '../../shared/sam/cli/samCliValidationUtils'
import { Result } from '../../shared/telemetry/telemetry'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { SamDeployWizardResponse } from '../wizards/samDeployWizard'
import { telemetry } from '../../shared/telemetry/telemetry'

const localize = nls.loadMessageBundle()

interface DeploySamApplicationParameters {
    sourceTemplatePath: string
    deployRootFolder: string
    environmentVariables: NodeJS.ProcessEnv
    region: string
    packageBucketName: string
    ecrRepo?: string
    destinationStackName: string
    parameterOverrides: Map<string, string>
}

export interface WindowFunctions {
    showInformationMessage: typeof vscode.window.showInformationMessage
    showErrorMessage: typeof vscode.window.showErrorMessage
    setStatusBarMessage(text: string, hideWhenDone: Thenable<any>): vscode.Disposable
}

export async function deploySamApplication(
    {
        samCliContext = getSamCliContext(),
        samDeployWizard,
    }: {
        samCliContext?: SamCliContext
        samDeployWizard: () => Promise<SamDeployWizardResponse | undefined>
    },
    {
        awsContext,
        settings,
        window = getDefaultWindowFunctions(),
        refreshFn = () => {
            // no need to await, doesn't need to block further execution (true -> no telemetry)
            void vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
        },
    }: {
        awsContext: Pick<AwsContext, 'getCredentials' | 'getCredentialProfileName'>
        settings: SamCliSettings
        window?: WindowFunctions
        refreshFn?: () => void
    }
): Promise<void> {
    let deployResult: Result = 'Succeeded'
    let samVersion: string | undefined
    let deployFolder: string | undefined
    try {
        const credentials = await awsContext.getCredentials()
        if (!credentials) {
            throw new Error('No AWS profile selected')
        }

        throwAndNotifyIfInvalid(await samCliContext.validator.detectValidSamCli())

        const deployWizardResponse = await samDeployWizard()

        if (!deployWizardResponse) {
            return
        }

        deployFolder = await makeTemporaryToolkitFolder('samDeploy')
        samVersion = await getSamCliVersion(samCliContext)

        const deployParameters: DeploySamApplicationParameters = {
            deployRootFolder: deployFolder,
            destinationStackName: deployWizardResponse.stackName,
            packageBucketName: deployWizardResponse.s3Bucket,
            ecrRepo: deployWizardResponse.ecrRepo?.repositoryUri,
            parameterOverrides: deployWizardResponse.parameterOverrides,
            environmentVariables: asEnvironmentVariables(credentials),
            region: deployWizardResponse.region,
            sourceTemplatePath: deployWizardResponse.template.fsPath,
        }

        const deployApplicationPromise = deploy({
            deployParameters,
            invoker: samCliContext.invoker,
            window,
        })

        window.setStatusBarMessage(
            addCodiconToString(
                'cloud-upload',
                localize(
                    'AWS.samcli.deploy.statusbar.message',
                    'Deploying SAM Application to {0}...',
                    deployWizardResponse.stackName
                )
            ),
            deployApplicationPromise
        )

        await deployApplicationPromise
        refreshFn()

        // successful deploy: retain S3 bucket for quick future access
        const profile = awsContext.getCredentialProfileName()
        if (profile) {
            await settings.updateSavedBuckets(profile, deployWizardResponse.region, deployWizardResponse.s3Bucket)
        } else {
            getLogger().warn('Profile not provided; cannot write recent buckets.')
        }
    } catch (err) {
        deployResult = 'Failed'
        outputDeployError(err as Error)
        void vscode.window.showErrorMessage(
            localize('AWS.samcli.deploy.workflow.error', 'Failed to deploy SAM application.')
        )
    } finally {
        await tryRemoveFolder(deployFolder)
        telemetry.sam_deploy.emit({ result: deployResult, version: samVersion })
    }
}

function getBuildRootFolder(deployRootFolder: string): string {
    return path.join(deployRootFolder, 'build')
}

function getBuildTemplatePath(deployRootFolder: string): string {
    // Assumption: sam build will always produce a template.yaml file.
    // If that is not the case, revisit this logic.
    return path.join(getBuildRootFolder(deployRootFolder), 'template.yaml')
}

function getPackageTemplatePath(deployRootFolder: string): string {
    return path.join(deployRootFolder, 'template.yaml')
}

async function buildOperation(params: {
    deployParameters: DeploySamApplicationParameters
    invoker: SamCliProcessInvoker
}): Promise<boolean> {
    try {
        getLogger('channel').info(localize('AWS.samcli.deploy.workflow.init', 'Building SAM Application...'))

        const buildDestination = getBuildRootFolder(params.deployParameters.deployRootFolder)

        const build = new SamCliBuildInvocation({
            buildDir: buildDestination,
            baseDir: undefined,
            templatePath: params.deployParameters.sourceTemplatePath,
            invoker: params.invoker,
        })

        await build.execute()

        return true
    } catch (err) {
        getLogger('channel').warn(
            localize(
                'AWS.samcli.build.failedBuild',
                '"sam build" failed: {0}',
                params.deployParameters.sourceTemplatePath
            )
        )
        return false
    }
}

async function packageOperation(
    params: {
        deployParameters: DeploySamApplicationParameters
        invoker: SamCliProcessInvoker
    },
    buildSuccessful: boolean
): Promise<void> {
    if (!buildSuccessful) {
        void vscode.window.showInformationMessage(
            localize(
                'AWS.samcli.deploy.workflow.packaging.noBuild',
                'Attempting to package source template directory directly since "sam build" failed'
            )
        )
    }

    getLogger('channel').info(
        localize(
            'AWS.samcli.deploy.workflow.packaging',
            'Packaging SAM Application to S3 Bucket: {0}',
            params.deployParameters.packageBucketName
        )
    )

    // HACK: Attempt to package the initial template if the build fails.
    const buildTemplatePath = buildSuccessful
        ? getBuildTemplatePath(params.deployParameters.deployRootFolder)
        : params.deployParameters.sourceTemplatePath
    const packageTemplatePath = getPackageTemplatePath(params.deployParameters.deployRootFolder)

    await runSamCliPackage(
        {
            sourceTemplateFile: buildTemplatePath,
            destinationTemplateFile: packageTemplatePath,
            environmentVariables: params.deployParameters.environmentVariables,
            region: params.deployParameters.region,
            s3Bucket: params.deployParameters.packageBucketName,
            ecrRepo: params.deployParameters.ecrRepo,
        },
        params.invoker
    )
}

async function deployOperation(params: {
    deployParameters: DeploySamApplicationParameters
    invoker: SamCliProcessInvoker
}): Promise<void> {
    try {
        getLogger('channel').info(
            localize(
                'AWS.samcli.deploy.workflow.stackName.initiated',
                'Deploying SAM Application to CloudFormation Stack: {0}',
                params.deployParameters.destinationStackName
            )
        )

        const packageTemplatePath = getPackageTemplatePath(params.deployParameters.deployRootFolder)

        await runSamCliDeploy(
            {
                parameterOverrides: params.deployParameters.parameterOverrides,
                environmentVariables: params.deployParameters.environmentVariables,
                templateFile: packageTemplatePath,
                region: params.deployParameters.region,
                stackName: params.deployParameters.destinationStackName,
                s3Bucket: params.deployParameters.packageBucketName,
                ecrRepo: params.deployParameters.ecrRepo,
            },
            params.invoker
        )
    } catch (err) {
        // Handle sam deploy Errors to supplement the error message prior to writing it out
        const error = err as Error

        getLogger().error(error)

        const errorMessage = enhanceAwsCloudFormationInstructions(String(err), params.deployParameters)
        globals.outputChannel.appendLine(errorMessage)

        throw new Error('Deploy failed')
    }
}

async function deploy(params: {
    deployParameters: DeploySamApplicationParameters
    invoker: SamCliProcessInvoker
    window: WindowFunctions
}): Promise<void> {
    globals.outputChannel.show(true)
    getLogger('channel').info(localize('AWS.samcli.deploy.workflow.start', 'Starting SAM Application deployment...'))

    const buildSuccessful = await buildOperation(params)
    await packageOperation(params, buildSuccessful)
    await deployOperation(params)

    getLogger('channel').info(
        localize(
            'AWS.samcli.deploy.workflow.success',
            'Deployed SAM Application to CloudFormation Stack: {0}',
            params.deployParameters.destinationStackName
        )
    )

    void params.window.showInformationMessage(
        localize('AWS.samcli.deploy.workflow.success.general', 'SAM Application deployment succeeded.')
    )
}

function enhanceAwsCloudFormationInstructions(
    message: string,
    deployParameters: DeploySamApplicationParameters
): string {
    // detect error message from https://github.com/aws/aws-cli/blob/4ff0cbacbac69a21d4dd701921fe0759cf7852ed/awscli/customizations/cloudformation/exceptions.py#L42
    // and append region to assist in troubleshooting the error
    // (command uses CLI configured value--users that don't know this and omit region won't see error)
    if (
        message.includes(
            `aws cloudformation describe-stack-events --stack-name ${deployParameters.destinationStackName}`
        )
    ) {
        message += ` --region ${deployParameters.region}`
    }

    return message
}

function outputDeployError(error: Error) {
    getLogger('channel').error(error)

    globals.outputChannel.show(true)
    getLogger('channel').error('AWS.samcli.deploy.general.error', 'Error deploying a SAM Application. {0}', checklogs())
}

function getDefaultWindowFunctions(): WindowFunctions {
    return {
        setStatusBarMessage: vscode.window.setStatusBarMessage,
        showErrorMessage: vscode.window.showErrorMessage,
        showInformationMessage: vscode.window.showInformationMessage,
    }
}
