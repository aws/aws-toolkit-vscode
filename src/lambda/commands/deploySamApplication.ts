/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { AwsContext, NoActiveCredentialError } from '../../shared/awsContext'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { getSamCliContext, SamCliContext } from '../../shared/sam/cli/samCliContext'
import { SamCliDeployInvocation } from '../../shared/sam/cli/samCliDeploy'
import { SamCliProcessInvoker } from '../../shared/sam/cli/samCliInvokerUtils'
import { SamCliPackageInvocation } from '../../shared/sam/cli/samCliPackage'
import { throwAndNotifyIfInvalid } from '../../shared/sam/cli/samCliValidationUtils'
import { ChannelLogger } from '../../shared/utilities/vsCodeUtils'
import { SamDeployWizard, SamDeployWizardResponse } from '../wizards/samDeployWizard'

const localize = nls.loadMessageBundle()

interface DeploySamApplicationParameters {
    sourceTemplatePath: string
    deployRootFolder: string
    profile: string
    region: string
    packageBucketName: string
    destinationStackName: string
    parameterOverrides: Map<string, string>
}

export async function deploySamApplication(
    {
        samCliContext = getSamCliContext(),
        channelLogger,
        ...restParams
    }: {
        samCliContext?: SamCliContext
        channelLogger: ChannelLogger,
        regionProvider: RegionProvider
    },
    awsContext: Pick<AwsContext, 'getCredentialProfileName'>
): Promise<void> {
    try {
        const profile: string | undefined = awsContext.getCredentialProfileName()
        if (!profile) {
            throw new NoActiveCredentialError()
        }

        throwAndNotifyIfInvalid(await samCliContext.validator.detectValidSamCli())

        const deployWizardResponse: SamDeployWizardResponse | undefined = await new SamDeployWizard(
            restParams.regionProvider
        ).run()

        if (!deployWizardResponse) {
            return
        }

        const deployParameters: DeploySamApplicationParameters = {
            deployRootFolder: await makeTemporaryToolkitFolder('samDeploy'),
            destinationStackName: deployWizardResponse.stackName,
            packageBucketName: deployWizardResponse.s3Bucket,
            parameterOverrides: deployWizardResponse.parameterOverrides,
            profile,
            region: deployWizardResponse.region,
            sourceTemplatePath: deployWizardResponse.template.fsPath,
        }

        const deployApplicationPromise = buildPackageDeploy({
            deployParameters,
            channelLogger,
            invoker: samCliContext.invoker,
        }).then(async () =>
            await del(deployParameters.deployRootFolder, {
                force: true
            })
        )

        vscode.window.setStatusBarMessage(
            localize(
                'AWS.samcli.deploy.statusbar.message',
                '$(cloud-upload) Deploying SAM Application to {0}...',
                deployWizardResponse.stackName,
            ),
            deployApplicationPromise
        )
    } catch (err) {
        const error = err as Error
        channelLogger.logger.error(error)

        channelLogger.channel.show(true)
        channelLogger.error(
            'AWS.samcli.deploy.general.error',
            'An error occurred while deploying a SAM Application. Check the logs for more information.'
        )
    }
}

function getBuildRootFolder(deployRootFolder: string): string {
    return path.join(deployRootFolder, 'build')
}

function getBuildTemplatePath(deployRootFolder: string): string {
    return path.join(getBuildRootFolder(deployRootFolder), 'template.yaml')
}

function getPackageTemplatePath(deployRootFolder: string): string {
    return path.join(deployRootFolder, 'template.yaml')
}

async function buildPackageDeploy(params: {
    deployParameters: DeploySamApplicationParameters,
    invoker: SamCliProcessInvoker,
    channelLogger: ChannelLogger,
}): Promise<void> {
    let stage: 'starting up' | 'building' | 'packaging' | 'deploying' = 'starting up'

    try {
        const buildDestination = getBuildRootFolder(params.deployParameters.deployRootFolder)
        const buildTemplatePath = getBuildTemplatePath(params.deployParameters.deployRootFolder)
        const packageTemplatePath = getPackageTemplatePath(params.deployParameters.deployRootFolder)

        params.channelLogger.channel.show(true)
        stage = 'building'
        const build = new SamCliBuildInvocation(
            {
                buildDir: buildDestination,
                baseDir: undefined,
                templatePath: params.deployParameters.sourceTemplatePath,
                invoker: params.invoker,
            }
        )

        params.channelLogger.channel.appendLine(localize(
            'AWS.samcli.deploy.workflow.init',
            'Building SAM Application...'
        ))
        await build.execute()

        stage = 'packaging'
        const packageInvocation = new SamCliPackageInvocation(
            buildTemplatePath,
            packageTemplatePath,
            params.deployParameters.packageBucketName,
            params.invoker,
            params.deployParameters.region,
            params.deployParameters.profile
        )

        params.channelLogger.channel.appendLine(localize(
            'AWS.samcli.deploy.workflow.packaging',
            'Packaging SAM Application to S3 Bucket: {0} with profile: {1}',
            params.deployParameters.packageBucketName,
            params.deployParameters.profile
        ))
        await packageInvocation.execute()

        stage = 'deploying'
        const deployInvocation = new SamCliDeployInvocation(
            packageTemplatePath,
            params.deployParameters.destinationStackName,
            params.deployParameters.region,
            params.deployParameters.parameterOverrides,
            params.invoker,
            params.deployParameters.profile
        )
        // Deploying can take a very long time for Python Lambda's with native dependencies so user needs feedback
        params.channelLogger.channel.appendLine(localize(
            'AWS.samcli.deploy.workflow.stackName.initiated',
            'Deploying SAM Application to CloudFormation Stack: {0} with profile: {1}',
            params.deployParameters.destinationStackName,
            params.deployParameters.profile
        ))
        await deployInvocation.execute()

        const msg = localize(
            'AWS.samcli.deploy.workflow.success',
            'Successfully deployed SAM Application to CloudFormation Stack: {0} with profile: {1}',
            params.deployParameters.destinationStackName,
            params.deployParameters.profile
        )
        params.channelLogger.channel.appendLine(msg)
        // TODO: Is this the right way to provide this feedback?
        vscode.window.showInformationMessage(msg)
    } catch (err) {
        let msg = localize(
            'AWS.samcli.deploy.workflow.error',
            'Failed to deploy SAM application. Error while {0}: {1}',
            stage, String(err)
        )
        // tslint:disable-next-line:max-line-length
        // detect error message from https://github.com/aws/aws-cli/blob/4ff0cbacbac69a21d4dd701921fe0759cf7852ed/awscli/customizations/cloudformation/exceptions.py#L42
        // and append region to assist in troubleshooting the error
        // (command uses CLI configured value--users that don't know this and omit region won't see error)
        // tslint:disable-next-line:max-line-length
        if (msg.includes(`aws cloudformation describe-stack-events --stack-name ${params.deployParameters.destinationStackName}`)) {
            msg += ` --region ${params.deployParameters.region}`
            if (params.deployParameters.profile) {
                msg += ` --profile ${params.deployParameters.profile}`
            }
        }
        params.channelLogger.channel.appendLine(msg)
        // TODO: Is this the right way to provide this feedback?
        vscode.window.showWarningMessage(msg)
    }
}
