/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import { mkdtemp } from '../../shared/filesystemUtilities'
import { SamCliDeployInvocation } from '../../shared/sam/cli/samCliDeploy'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from '../../shared/sam/cli/samCliInvoker'
import { SamCliPackageInvocation } from '../../shared/sam/cli/samCliPackage'
import { SamDeployWizard, SamDeployWizardResponse } from '../wizards/samDeployWizard'

export async function deploySamApplication(
    invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker()
) {
    const args: SamDeployWizardResponse | undefined = await new SamDeployWizard().run()
    if (!args) {
        return
    }

    const { template, s3Bucket, stackName } = args

    const tempFolder = await mkdtemp('samDeploy')
    const outputTemplatePath = path.join(tempFolder, 'template.yaml')

    try {
        const packageInvocation = new SamCliPackageInvocation(template.fsPath, outputTemplatePath, s3Bucket, invoker)
        await packageInvocation.execute()

        const deployInvocation = new SamCliDeployInvocation(outputTemplatePath, stackName, invoker)
        await deployInvocation.execute()

        // TODO: Is this the right way to provide this feedback?
        vscode.window.showInformationMessage(`Successfully deployed '${stackName}' to ${s3Bucket}`)
    } catch (err) {
        // TODO: Is this the right way to provide this feedback?
        vscode.window.showInformationMessage(`Could not deploy '${stackName}' to ${s3Bucket}: ${String(err)}`)
    } finally {
        await del(tempFolder, {
            force: true
        })
    }
}
