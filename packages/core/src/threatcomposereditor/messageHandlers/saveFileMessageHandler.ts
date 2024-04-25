/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { SaveFileRequestMessage, SaveFileResponseMessage, MessageType, Command, WebviewContext } from '../types'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'

export async function saveFileMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    let saveFileResponseMessage: SaveFileResponseMessage | undefined = undefined

    // If filePath is empty, save contents in default template file
    const filePath = context.defaultTemplatePath

    await telemetry.threatcomposer_fileSaved.run(async span => {
        const previousAutoSaveFileContent = context.autoSaveFileWatches[filePath].fileContents

        try {
            if (context.fileWatches[filePath] && context.fileWatches[filePath].fileContents !== request.fileContents) {
                context.autoSaveFileWatches[filePath] = { fileContents: request.fileContents }

                await saveWorkspace(context, request.fileContents)

                await vscode.commands.executeCommand('workbench.action.files.save')

                if (context.textDocument.isDirty) {
                    throw new Error('Document has been modified externally')
                }

                await vscode.window.showInformationMessage('Threat Composer JSON has bees saved')

                saveFileResponseMessage = {
                    messageType: MessageType.RESPONSE,
                    command: Command.SAVE_FILE,
                    filePath: filePath,
                    isSuccess: true,
                }
            }
        } catch (e) {
            context.autoSaveFileWatches[filePath] = { fileContents: previousAutoSaveFileContent }
            const errorMessage = (e as Error).message

            saveFileResponseMessage = {
                messageType: MessageType.RESPONSE,
                command: Command.SAVE_FILE,
                filePath: filePath,
                isSuccess: false,
                failureReason: errorMessage,
            }
            await vscode.window.showErrorMessage(errorMessage)
            throw new ToolkitError(errorMessage, { code: 'Failed to Save' })
        }
    })

    if (saveFileResponseMessage) {
        await context.panel.webview.postMessage(saveFileResponseMessage)
    }
}

export async function autoSaveFileMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    let saveFileResponseMessage: SaveFileResponseMessage | undefined = undefined

    // If filePath is empty, save contents in default template file
    const filePath = context.defaultTemplatePath

    await telemetry.threatcomposer_fileSaved.run(async span => {
        const previousAutoSaveFileContent = context.autoSaveFileWatches[filePath].fileContents

        try {
            if (
                context.autoSaveFileWatches[filePath] &&
                context.autoSaveFileWatches[filePath].fileContents !== request.fileContents
            ) {
                context.autoSaveFileWatches[filePath] = { fileContents: request.fileContents }

                await saveWorkspace(context, request.fileContents)

                saveFileResponseMessage = {
                    messageType: MessageType.RESPONSE,
                    command: Command.SAVE_FILE,
                    filePath: filePath,
                    isSuccess: true,
                }
            }
        } catch (e) {
            context.autoSaveFileWatches[filePath] = { fileContents: previousAutoSaveFileContent }
            const errorMessage = (e as Error).message

            saveFileResponseMessage = {
                messageType: MessageType.RESPONSE,
                command: Command.SAVE_FILE,
                filePath: filePath,
                isSuccess: false,
                failureReason: errorMessage,
            }
            await vscode.window.showErrorMessage(errorMessage)
            throw new ToolkitError(errorMessage, { code: 'Failed to Save' })
        }
    })

    if (saveFileResponseMessage) {
        await context.panel.webview.postMessage(saveFileResponseMessage)
    }
}
async function saveWorkspace(context: WebviewContext, fileContents: string) {
    context.autoSaveFileWatches[context.defaultTemplatePath] = { fileContents: fileContents }

    const edit = new vscode.WorkspaceEdit()
    // Just replace the entire document every time for this example extension.
    // A more complete extension should compute minimal edits instead.
    edit.replace(context.textDocument.uri, new vscode.Range(0, 0, context.textDocument.lineCount, 0), fileContents)

    await vscode.workspace.applyEdit(edit)
}
