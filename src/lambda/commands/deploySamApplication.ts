/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { asEnvironmentVariables } from '../../credentials/credentialsUtilities'
import { AwsContext, NoActiveCredentialError } from '../../shared/awsContext'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { getSamCliContext, SamCliContext } from '../../shared/sam/cli/samCliContext'
import { runSamCliDeploy } from '../../shared/sam/cli/samCliDeploy'
import { SamCliProcessInvoker } from '../../shared/sam/cli/samCliInvokerUtils'
import { runSamCliPackage } from '../../shared/sam/cli/samCliPackage'
import { throwAndNotifyIfInvalid } from '../../shared/sam/cli/samCliValidationUtils'
import { makeCheckLogsMessage } from '../../shared/utilities/messages'
import { ChannelLogger } from '../../shared/utilities/vsCodeUtils'
import { SamDeployWizardResponse } from '../wizards/samDeployWizard'

const localize = nls.loadMessageBundle()

interface DeploySamApplicationParameters {
    sourceTemplatePath: string
    deployRootFolder: string
    environmentVariables: NodeJS.ProcessEnv
    region: string
    packageBucketName: string
    destinationStackName: string
    parameterOverrides: Map<string, string>
}

export interface WindowFunctions {
    showInformationMessage: typeof vscode.window.showInformationMessage
    showErrorMessage: typeof vscode.window.showErrorMessage
    setStatusBarMessage(text: string, hideWhenDone: Thenable<any>): vscode.Disposable
}

export interface SamDeployWizardResponseProvider {
    getSamDeployWizardResponse(): Promise<SamDeployWizardResponse | undefined>
}

export async function deploySamApplication(
    {
        samCliContext = getSamCliContext(),
        channelLogger,
        samDeployWizard
    }: {
        samCliContext?: SamCliContext
        channelLogger: ChannelLogger
        samDeployWizard: SamDeployWizardResponseProvider
    },
    {
        awsContext,
        window = getDefaultWindowFunctions()
    }: {
        awsContext: Pick<AwsContext, 'getCredentials'>
        window?: WindowFunctions
    }
): Promise<void> {
    try {
        const credentials = await awsContext.getCredentials()
        if (!credentials) {
            throw new NoActiveCredentialError()
        }

        throwAndNotifyIfInvalid(await samCliContext.validator.detectValidSamCli())

        const deployWizardResponse = await samDeployWizard.getSamDeployWizardResponse()

        if (!deployWizardResponse) {
            return
        }

        const deployParameters: DeploySamApplicationParameters = {
            deployRootFolder: await makeTemporaryToolkitFolder('samDeploy'),
            destinationStackName: deployWizardResponse.stackName,
            packageBucketName: deployWizardResponse.s3Bucket,
            parameterOverrides: deployWizardResponse.parameterOverrides,
            environmentVariables: asEnvironmentVariables(credentials),
            region: deployWizardResponse.region,
            sourceTemplatePath: deployWizardResponse.template.fsPath
        }

        const deployApplicationPromise = deploy({
            deployParameters,
            channelLogger,
            invoker: samCliContext.invoker,
            window
        }).then(
            async () =>
                // The parent method will exit shortly, and the status bar will run this promise
                // Cleanup has to be chained into the promise as a result.
                await del(deployParameters.deployRootFolder, {
                    force: true
                })
        )

        window.setStatusBarMessage(
            localize(
                'AWS.samcli.deploy.statusbar.message',
                '$(cloud-upload) Deploying SAM Application to {0}...',
                deployWizardResponse.stackName
            ),
            deployApplicationPromise
        )
    } catch (err) {
        outputDeployError(err as Error, channelLogger)
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
    channelLogger: ChannelLogger
}): Promise<void> {
    params.channelLogger.info('AWS.samcli.deploy.workflow.init', 'Building SAM Application...')

    const buildDestination = getBuildRootFolder(params.deployParameters.deployRootFolder)

    const build = new SamCliBuildInvocation({
        buildDir: buildDestination,
        baseDir: undefined,
        templatePath: params.deployParameters.sourceTemplatePath,
        invoker: params.invoker
    })

    await build.execute()
}

async function packageOperation(params: {
    deployParameters: DeploySamApplicationParameters
    invoker: SamCliProcessInvoker
    channelLogger: ChannelLogger
}): Promise<void> {
    params.channelLogger.info(
        'AWS.samcli.deploy.workflow.packaging',
        'Packaging SAM Application to S3 Bucket: {0}',
        params.deployParameters.packageBucketName
    )

    const buildTemplatePath = getBuildTemplatePath(params.deployParameters.deployRootFolder)
    const packageTemplatePath = getPackageTemplatePath(params.deployParameters.deployRootFolder)

    await runSamCliPackage(
        {
            sourceTemplateFile: buildTemplatePath,
            destinationTemplateFile: packageTemplatePath,
            environmentVariables: params.deployParameters.environmentVariables,
            region: params.deployParameters.region,
            s3Bucket: params.deployParameters.packageBucketName
        },
        params.invoker,
        params.channelLogger.logger
    )
}

async function deployOperation(params: {
    deployParameters: DeploySamApplicationParameters
    invoker: SamCliProcessInvoker
    channelLogger: ChannelLogger
}): Promise<void> {
    try {
        params.channelLogger.info(
            'AWS.samcli.deploy.workflow.stackName.initiated',
            'Deploying SAM Application to CloudFormation Stack: {0}',
            params.deployParameters.destinationStackName
        )

        const packageTemplatePath = getPackageTemplatePath(params.deployParameters.deployRootFolder)

        await runSamCliDeploy(
            {
                parameterOverrides: params.deployParameters.parameterOverrides,
                environmentVariables: params.deployParameters.environmentVariables,
                templateFile: packageTemplatePath,
                region: params.deployParameters.region,
                stackName: params.deployParameters.destinationStackName
            },
            params.invoker,
            params.channelLogger.logger
        )
    } catch (err) {
        // Handle sam deploy Errors to supplement the error message prior to writing it out
        const error = err as Error

        params.channelLogger.logger.error(error)

        const errorMessage = enhanceAwsCloudFormationInstructions(String(err), params.deployParameters)
        params.channelLogger.channel.appendLine(errorMessage)

        throw new Error('Deploy failed')
    }
}

async function deploy(params: {
    deployParameters: DeploySamApplicationParameters
    invoker: SamCliProcessInvoker
    channelLogger: ChannelLogger
    window: WindowFunctions
}): Promise<void> {
    try {
        params.channelLogger.channel.show(true)
        params.channelLogger.info('AWS.samcli.deploy.workflow.start', 'Starting SAM Application deployment...')

        await buildOperation(params)
        await packageOperation(params)
        await deployOperation(params)

        params.channelLogger.info(
            'AWS.samcli.deploy.workflow.success',
            'Successfully deployed SAM Application to CloudFormation Stack: {0}',
            params.deployParameters.destinationStackName
        )

        params.window.showInformationMessage(
            localize('AWS.samcli.deploy.workflow.success.general', 'SAM Application deployment succeeded.')
        )
    } catch (err) {
        outputDeployError(err as Error, params.channelLogger)

        params.window.showErrorMessage(
            localize('AWS.samcli.deploy.workflow.error', 'Failed to deploy SAM application.')
        )
    }
}

function enhanceAwsCloudFormationInstructions(
    message: string,
    deployParameters: DeploySamApplicationParameters
): string {
    // tslint:disable-next-line:max-line-length
    // detect error message from https://github.com/aws/aws-cli/blob/4ff0cbacbac69a21d4dd701921fe0759cf7852ed/awscli/customizations/cloudformation/exceptions.py#L42
    // and append region to assist in troubleshooting the error
    // (command uses CLI configured value--users that don't know this and omit region won't see error)
    // tslint:disable-next-line:max-line-length
    if (
        message.includes(
            `aws cloudformation describe-stack-events --stack-name ${deployParameters.destinationStackName}`
        )
    ) {
        message += ` --region ${deployParameters.region}`
    }

    return message
}

function outputDeployError(error: Error, channelLogger: ChannelLogger) {
    channelLogger.logger.error(error)

    if (error.message) {
        channelLogger.channel.appendLine(error.message)
    }

    const checkLogsMessage = makeCheckLogsMessage()

    channelLogger.channel.show(true)
    channelLogger.error(
        'AWS.samcli.deploy.general.error',
        'An error occurred while deploying a SAM Application. {0}',
        checkLogsMessage
    )
}

function getDefaultWindowFunctions(): WindowFunctions {
    return {
        setStatusBarMessage: vscode.window.setStatusBarMessage,
        showErrorMessage: vscode.window.showErrorMessage,
        showInformationMessage: vscode.window.showInformationMessage
    }
}
