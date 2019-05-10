/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { extensionSettingsPrefix, profileSettingKey } from '../../shared/constants'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { SamCliDeployInvocation } from '../../shared/sam/cli/samCliDeploy'
import { DefaultSamCliProcessInvoker } from '../../shared/sam/cli/samCliInvoker'
import { SamCliProcessInvoker } from '../../shared/sam/cli/samCliInvokerUtils'
import { SamCliPackageInvocation } from '../../shared/sam/cli/samCliPackage'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'
import { SamDeployWizard, SamDeployWizardResponse } from '../wizards/samDeployWizard'

const localize = nls.loadMessageBundle()

export async function deploySamApplication({
    invoker = new DefaultSamCliProcessInvoker(),
    ...restParams
}: {
    invoker?: SamCliProcessInvoker
    outputChannel: vscode.OutputChannel
    regionProvider: RegionProvider
}) {
    const args: SamDeployWizardResponse | undefined = await new SamDeployWizard(restParams.regionProvider).run()
    if (!args) {
        return
    }

    const { region, template, s3Bucket, stackName, parameterOverrides } = args
    const deployApplicationPromise = (async () => {
        const tempFolder = await makeTemporaryToolkitFolder('samDeploy')
        const buildDestination = path.join(tempFolder, 'build')
        const buildTemplatePath = path.join(buildDestination, 'template.yaml')
        const outputTemplatePath = path.join(tempFolder, 'template.yaml')
        let stage: 'starting up' | 'building' | 'packaging' | 'deploying' = 'starting up'

        const settingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
        const profile = settingsConfiguration.readSetting<string>(profileSettingKey)
        let msg = ''

        try {
            if (!profile) {
                const err = new Error('No AWS profile selected')
                throw err
            }

            restParams.outputChannel.show(true)
            stage = 'building'
            const build = new SamCliBuildInvocation(
                {
                    buildDir: buildDestination,
                    baseDir: undefined,
                    templatePath: template.fsPath,
                    invoker
                }
            )

            restParams.outputChannel.appendLine(localize(
                'AWS.samcli.deploy.workflow.init',
                'Building SAM Application...'
            ))
            await build.execute()

            stage = 'packaging'
            const packageInvocation = new SamCliPackageInvocation(
                buildTemplatePath,
                outputTemplatePath,
                s3Bucket,
                invoker,
                region,
                profile
            )

            restParams.outputChannel.appendLine(localize(
                'AWS.samcli.deploy.workflow.packaging',
                'Packaging SAM Application to S3 Bucket: {0} with profile: {1}',
                s3Bucket, profile
            ))
            await packageInvocation.execute()

            stage = 'deploying'
            const deployInvocation = new SamCliDeployInvocation(
                outputTemplatePath,
                stackName,
                region,
                parameterOverrides,
                invoker,
                profile
            )
            // Deploying can take a very long time for Python Lambda's with native dependencies so user needs feedback
            restParams.outputChannel.appendLine(localize(
                'AWS.samcli.deploy.workflow.stackName.initiated',
                'Deploying SAM Application to CloudFormation Stack: {0}',
                stackName
            ))
            await deployInvocation.execute()

            msg = localize(
                'AWS.samcli.deploy.workflow.success',
                'Successfully deployed SAM Application to CloudFormation Stack: {0} with profile: {1}',
                stackName, profile
            )
        } catch (err) {
            msg = localize(
                'AWS.samcli.deploy.workflow.error',
                'Failed to deploy SAM application. Error while {0}: {1}',
                stage, String(err)
            )
            // tslint:disable-next-line:max-line-length
            // detect error message from https://github.com/aws/aws-cli/blob/4ff0cbacbac69a21d4dd701921fe0759cf7852ed/awscli/customizations/cloudformation/exceptions.py#L42
            // and append region to assist in troubleshooting the error
            // (command uses CLI configured value--users that don't know this and omit region won't see error)
            if (msg.includes(`aws cloudformation describe-stack-events --stack-name ${args.stackName}`)) {
                msg += ` --region ${args.region}`
                if (profile) {
                    msg += ` --profile ${profile}`
                }
            }
        } finally {
            restParams.outputChannel.appendLine(msg)
            // TODO: Is this the right way to provide this feedback?
            vscode.window.showWarningMessage(msg)
            await del(tempFolder, {
                force: true
            })
        }
    })()

    vscode.window.setStatusBarMessage(
        localize(
            'AWS.samcli.deploy.statusbar.message',
            '$(cloud-upload) Deploying SAM Application to {0}...',
            stackName,
        ),
        deployApplicationPromise
    )
}
