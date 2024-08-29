/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'
import { injectCredentials } from '../sync'
import { Auth } from '../../../auth/auth'

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
        // try to use connection, ignore if no active iam connection
        const connection = Auth.instance.activeConnection

        const childProcessResult = await invoker.invoke({
            arguments: args,
            spawnOptions: {
                env:
                    connection?.type === 'iam' && connection.state === 'valid'
                        ? await injectCredentials(connection)
                        : undefined,
                cwd: listStackResourcesArguments.projectRoot?.fsPath,
            },
        })

        logAndThrowIfUnexpectedExitCode(childProcessResult, 0)

        return childProcessResult.stdout
    } catch (error: any) {
        void vscode.window.showErrorMessage(`Failed to run SAM CLI list resources: ${error.message}`)
        return []
    }
}
