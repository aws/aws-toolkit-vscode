/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'
import { getSpawnEnv } from '../../env/resolveEnv'
import { getLogger } from '../../logger/logger'
import { showWarningWithSamCliUpdateInstruction, validateSamCliVersionForTemplateFile } from './samCliFeatureRegistry'

export interface SamCliListResourcesParameters {
    templateFile: string
    stackName: string
    region?: string
    projectRoot?: vscode.Uri
}

export async function runSamCliListResource(
    listStackResourcesArguments: SamCliListResourcesParameters,
    invoker: SamCliProcessInvoker
): Promise<any> {
    // Validate template features before invoking SAM CLI
    try {
        const templateUri = vscode.Uri.file(listStackResourcesArguments.templateFile)
        await validateSamCliVersionForTemplateFile(templateUri)
    } catch (validationError: any) {
        // Validation failed, show error with update instructions
        getLogger().warn('SAM CLI feature validation failed: %O', validationError)
        const errorMessage = `Failed to run SAM CLI list resources. ${validationError.message}`
        void showWarningWithSamCliUpdateInstruction(errorMessage)
        return []
    }

    const args = [
        'list',
        'resources',
        '--template-file',
        listStackResourcesArguments.templateFile,
        '--stack-name',
        listStackResourcesArguments.stackName,
        '--output',
        'json',
    ]

    if (listStackResourcesArguments.region) {
        args.push('--region', listStackResourcesArguments.region)
    }

    try {
        const childProcessResult = await invoker.invoke({
            arguments: args,
            spawnOptions: {
                env: await getSpawnEnv(process.env),
                cwd: listStackResourcesArguments.projectRoot?.fsPath,
            },
        })

        logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
        return childProcessResult.stdout
    } catch (error: any) {
        const message = error.message
        if (message.includes('does not exist on Cloudformation')) {
            getLogger().info(message)
        } else {
            void vscode.window.showWarningMessage(`Failed to run SAM CLI list resources: ${message}`)
        }
        return []
    }
}
