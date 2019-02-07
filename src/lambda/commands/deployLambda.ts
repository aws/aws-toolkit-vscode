/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as del from 'del'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { mkdtempAsync, writeFileAsync } from '../../shared/filesystem'
import { SamCliDeployInvocation } from '../../shared/sam/cli/samCliDeploy'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from '../../shared/sam/cli/samCliInvoker'
import { SamCliPackageInvocation } from '../../shared/sam/cli/samCliPackage'
import { SamDeployWizard, SamDeployWizardArgs } from '../wizards/samDeployWizard'

export async function deployLambda(
    invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker()
) {
    const args: SamDeployWizardArgs | undefined = await new SamDeployWizard().run()
    if (!args) {
        return
    }

    const packageInvocation = new SamCliPackageInvocation(args.template.fsPath, args.s3Bucket, invoker)
    const { templateContent } = await packageInvocation.execute()

    const tempFolder = await mkdtempAsync(path.join(os.tmpdir(), 'samDeploy'))
    try {
        const templatePath = path.join(tempFolder, 'template.yaml')
        await writeFileAsync(templatePath, templateContent)

        const deployInvocation = new SamCliDeployInvocation(templatePath, args.stackName, invoker)
        await deployInvocation.execute()

        vscode.window.showInformationMessage(`Successfully deployed '${args.stackName}' to ${args.s3Bucket}`)
    } catch (err) {
        vscode.window.showInformationMessage(`Could not deploy '${args.stackName}' to ${args.s3Bucket}: ${String(err)}`)
    } finally {
        await del(tempFolder, {
            force: true
        })
    }
}
