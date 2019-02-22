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
}) {
    const args: SamDeployWizardResponse | undefined = await new SamDeployWizard().run()
    if (!args) {
        return
    }

    const { template, s3Bucket, stackName } = args

    const tempFolder = await mkdtemp('samDeploy')
    const outputTemplatePath = path.join(tempFolder, 'template.yaml')
    let stage = 'packaging'
    try {
        const packageInvocation = new SamCliPackageInvocation(template.fsPath, outputTemplatePath, s3Bucket, invoker)
        restParams.outputChannel.show(true)
        // TODO: Add nls support
        restParams.outputChannel.appendLine(`Packaging SAM app to "${s3Bucket}" S3 bucket`)
        await packageInvocation.execute()

        stage = 'deploying'
        const deployInvocation = new SamCliDeployInvocation(outputTemplatePath, stackName, invoker)
        // Deploying can take a very long time for Python Lambda's with native dependencies so user needs feedback
        restParams.outputChannel.appendLine(localize(
          'AWS.samcli.deploy.stackName.initiated',
          'Deploying "{0}" stack...',
          stackName
        ))
        await deployInvocation.execute()
        // TODO: Add nls support
        const msg = `Successfully deployed "${stackName}" to S3 "${s3Bucket}"`
        restParams.outputChannel.appendLine(msg)
        // TODO: Is this the right way to provide this feedback?
        vscode.window.showInformationMessage(msg)
    } catch (err) {
        // TODO: Add nls support
        const msg = `Failed ${stage} "${stackName}" using S3 bucket "${s3Bucket}": ${String(err)}`
        restParams.outputChannel.appendLine(msg)
        // TODO: Is this the right way to provide this feedback?
        vscode.window.showWarningMessage(msg)
    } finally {
        await del(tempFolder, {
            force: true
        })
    }
}
