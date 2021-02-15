/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { asEnvironmentVariables } from '../../credentials/credentialsUtilities'
import { AwsContext, NoActiveCredentialError } from '../../shared/awsContext'
import { ext } from '../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { getSamCliContext, SamCliContext } from '../../shared/sam/cli/samCliContext'
import { runSamCliDeploy } from '../../shared/sam/cli/samCliDeploy'
import { SamCliProcessInvoker } from '../../shared/sam/cli/samCliInvokerUtils'
import { runSamCliPackage } from '../../shared/sam/cli/samCliPackage'
import { throwAndNotifyIfInvalid } from '../../shared/sam/cli/samCliValidationUtils'
import { recordSamDeploy, Result } from '../../shared/telemetry/telemetry'
import { makeCheckLogsMessage } from '../../shared/utilities/messages'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { SamDeployWizardResponse } from '../wizards/samDeployWizard'

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
        window = getDefaultWindowFunctions(),
    }: {
        awsContext: Pick<AwsContext, 'getCredentials'>
        window?: WindowFunctions
    }
): Promise<void> {
    let deployResult: Result = 'Succeeded'
    let deployFolder: string | undefined
    try {
        const credentials = await awsContext.getCredentials()
        if (!credentials) {
            throw new NoActiveCredentialError()
        }

        throwAndNotifyIfInvalid(await samCliContext.validator.detectValidSamCli())

        const deployWizardResponse = await samDeployWizard()

        if (!deployWizardResponse) {
            return
        }

        deployFolder = await makeTemporaryToolkitFolder('samDeploy')

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
    } catch (err) {
        deployResult = 'Failed'
        outputDeployError(err as Error)
    } finally {
        await tryRemoveFolder(deployFolder)
        recordSamDeploy({ result: deployResult })
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
        vscode.window.showInformationMessage(
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
        ext.outputChannel.appendLine(errorMessage)

        throw new Error('Deploy failed')
    }
}

async function deploy(params: {
    deployParameters: DeploySamApplicationParameters
    invoker: SamCliProcessInvoker
    window: WindowFunctions
}): Promise<void> {
    try {
        ext.outputChannel.show(true)
        getLogger('channel').info(
            localize('AWS.samcli.deploy.workflow.start', 'Starting SAM Application deployment...')
        )

        const buildSuccessful = await buildOperation(params)
        await packageOperation(params, buildSuccessful)
        await deployOperation(params)

        getLogger('channel').info(
            localize(
                'AWS.samcli.deploy.workflow.success',
                'Successfully deployed SAM Application to CloudFormation Stack: {0}',
                params.deployParameters.destinationStackName
            )
        )

        params.window.showInformationMessage(
            localize('AWS.samcli.deploy.workflow.success.general', 'SAM Application deployment succeeded.')
        )
    } catch (err) {
        outputDeployError(err as Error)

        params.window.showErrorMessage(
            localize('AWS.samcli.deploy.workflow.error', 'Failed to deploy SAM application.')
        )
    }
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

    const checkLogsMessage = makeCheckLogsMessage()

    ext.outputChannel.show(true)
    getLogger('channel').error(
        'AWS.samcli.deploy.general.error',
        'An error occurred while deploying a SAM Application. {0}',
        checkLogsMessage
    )
}

function getDefaultWindowFunctions(): WindowFunctions {
    return {
        setStatusBarMessage: vscode.window.setStatusBarMessage,
        showErrorMessage: vscode.window.showErrorMessage,
        showInformationMessage: vscode.window.showInformationMessage,
    }
}
