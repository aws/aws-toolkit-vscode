/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { mkdtemp } from '../../shared/filesystemUtilities'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { SamCliDeployInvocation } from '../../shared/sam/cli/samCliDeploy'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from '../../shared/sam/cli/samCliInvoker'
import { SamCliPackageInvocation } from '../../shared/sam/cli/samCliPackage'
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

    const { region, template, s3Bucket, stackName } = args

    const tempFolder = await mkdtemp('samDeploy')
    const outputTemplatePath = path.join(tempFolder, 'template.yaml')
    let stage = 'packaging'
    try {
        const packageInvocation = new SamCliPackageInvocation(template.fsPath, outputTemplatePath,
                                                              s3Bucket, invoker, region)
        restParams.outputChannel.show(true)
        // TODO: Add nls support
        restParams.outputChannel.appendLine(`Packaging SAM Application to S3 Bucket: ${s3Bucket}`)
        await packageInvocation.execute()

        stage = 'deploying'
        const deployInvocation = new SamCliDeployInvocation(outputTemplatePath, stackName, invoker, region)
        // Deploying can take a very long time for Python Lambda's with native dependencies so user needs feedback
        restParams.outputChannel.appendLine(localize(
          'AWS.samcli.deploy.stackName.initiated',
          'Deploying {0} stack...',
          stackName
        ))
        await deployInvocation.execute()
        // TODO: Add nls support
        const msg = `Successfully deployed SAM Application to CloudFormation Stack: ${stackName}`
        restParams.outputChannel.appendLine(msg)
        // TODO: Is this the right way to provide this feedback?
        vscode.window.showInformationMessage(msg)
    } catch (err) {
        // TODO: Add nls support
        const msg = `Failed to deploy SAM application. Error while ${stage}: ${String(err)}`
        restParams.outputChannel.appendLine(msg)
        // TODO: Is this the right way to provide this feedback?
        vscode.window.showWarningMessage(msg)
    } finally {
        await del(tempFolder, {
            force: true
        })
    }
}
