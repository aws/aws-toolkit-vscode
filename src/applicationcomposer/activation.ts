/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ApplicationComposerManager } from '../applicationcomposer/webviewManager'
import { Commands } from '../shared/vscode/commands2'
import { ToolkitError } from '../shared/errors'

export const openTemplateInComposerCommand = Commands.declare(
    'aws.openInApplicationComposer',
    (globalState: vscode.Memento, manager: ApplicationComposerManager) =>
        async (arg?: vscode.TextEditor | vscode.Uri) => {
            try {
                arg ??= vscode.window.activeTextEditor
                const input = arg instanceof vscode.Uri ? arg : arg?.document

                if (!input) {
                    throw new ToolkitError('No active text editor or document found')
                }

                return await manager.visualizeTemplate(globalState, input)
            } finally {
                // TODO: telemetry
            }
        }
)

export const createTemplateWithComposerCommand = Commands.declare(
    'aws.createWithApplicationComposer',
    (manager: ApplicationComposerManager) => async (arg?: vscode.TextEditor | vscode.Uri) => {
        return await manager.createTemplate()
    }
)

export const openInComposerDialogCommand = Commands.declare(
    'aws.openInApplicationComposerDialog',
    (globalState: vscode.Memento, manager: ApplicationComposerManager) =>
        async (arg?: vscode.TextEditor | vscode.Uri) => {
            const fileUri = await vscode.window.showOpenDialog({
                filters: {
                    Templates: ['yml', 'yaml', 'json'],
                },
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
            })
            if (fileUri && fileUri[0]) {
                return await manager.visualizeTemplate(globalState, fileUri[0])
            }
        }
)

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    const visualizationManager = new ApplicationComposerManager(extensionContext)

    extensionContext.subscriptions.push(
        openTemplateInComposerCommand.register(extensionContext.globalState, visualizationManager),
        createTemplateWithComposerCommand.register(visualizationManager),
        openInComposerDialogCommand.register(extensionContext.globalState, visualizationManager)
    )
}
