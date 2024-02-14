/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ApplicationComposerManager } from './webviewManager'
import { Commands } from '../shared/vscode/commands2'
import { ToolkitError } from '../shared/errors'
import { AuthUtil, getChatAuthState } from '../codewhisperer/util/authUtil'
import { telemetry } from '../shared/telemetry/telemetry'
import { ApplicationComposerCodeLensProvider } from './codeLensProvider'

export const openTemplateInComposerCommand = Commands.declare(
    'aws.openInApplicationComposer',
    (manager: ApplicationComposerManager) => async (arg?: vscode.TextEditor | vscode.Uri) => {
        const authState = await getChatAuthState(AuthUtil.instance)

        let result: vscode.WebviewPanel | undefined
        await telemetry.appcomposer_openTemplate.run(async span => {
            span.record({
                hasChatAuth: authState.codewhispererChat === 'connected' || authState.codewhispererChat === 'expired',
            })
            arg ??= vscode.window.activeTextEditor
            const input = arg instanceof vscode.Uri ? arg : arg?.document

            if (!input) {
                throw new ToolkitError('No active text editor or document found')
            }

            result = await manager.visualizeTemplate(input)
        })
        return result
    }
)

export const openInComposerDialogCommand = Commands.declare(
    'aws.openInApplicationComposerDialog',
    (manager: ApplicationComposerManager) => async () => {
        const fileUri = await vscode.window.showOpenDialog({
            filters: {
                Templates: ['yml', 'yaml', 'json', 'template'],
            },
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
        })
        if (fileUri && fileUri[0]) {
            return await manager.visualizeTemplate(fileUri[0])
        }
    }
)

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    const visualizationManager = new ApplicationComposerManager(extensionContext)

    extensionContext.subscriptions.push(
        openTemplateInComposerCommand.register(visualizationManager),
        openInComposerDialogCommand.register(visualizationManager)
    )

    extensionContext.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            ['yaml', 'json', { scheme: 'file' }],
            new ApplicationComposerCodeLensProvider()
        )
    )
}
