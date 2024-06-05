/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import {
    Command,
    MessageType,
    SaveCompleteSubType,
    SaveFileRequestMessage,
    SaveFileResponseMessage,
    WebviewContext,
} from '../types'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
import _ from 'lodash'

/**
 * Handler for saving a file message from the webview.
 * This function performs the following tasks:
 * 1. It saves the file contents to the workspace.
 * 2. It saves the file using the `vscode` command `workbench.action.files.save`.
 * 3. It handles the case where the file has been externally modified.
 * 4. It sends a response message back to the webview with the save status and any failure reason.
 * @returns {Promise<void>} A promise that resolves when the file has been saved.
 * @param request The request message containing the file contents and path.
 * @param context The webview context containing the necessary information for saving the file.
 */
export async function saveFileMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    let saveCompleteSubType = SaveCompleteSubType.SAVE_FAILED
    let saveSuccess = false
    let errorMessage: string | undefined = undefined
    let previousAutoSaveFileContent: string | undefined = undefined

    // If filePath is empty, save contents in default template file
    const filePath = context.defaultTemplatePath

    await telemetry.threatComposer_fileSaved.run(async span => {
        span.record({
            id: context.fileId,
            saveType: 'MANUAL_SAVE',
        })

        try {
            if (context.fileStates[filePath] && context.autoSaveFileState[filePath]) {
                previousAutoSaveFileContent = context.autoSaveFileState[filePath].fileContents

                if (context.fileStates[filePath].fileContents !== request.fileContents) {
                    context.autoSaveFileState[filePath] = { fileContents: request.fileContents }

                    await saveWorkspace(context, request.fileContents)

                    await vscode.commands.executeCommand('workbench.action.files.save')

                    if (context.textDocument.isDirty) {
                        throw new Error('Document has been modified externally')
                    }

                    void vscode.window.showInformationMessage('Threat Composer JSON has bees saved')

                    saveCompleteSubType = SaveCompleteSubType.SAVED
                } else {
                    saveCompleteSubType = SaveCompleteSubType.SAVE_SKIPPED_SAME_CONTENT
                }
                saveSuccess = true
            } else {
                throw new Error('Previous state of file not found')
            }
        } catch (e) {
            if (previousAutoSaveFileContent !== undefined) {
                context.autoSaveFileState[filePath] = { fileContents: previousAutoSaveFileContent }
            }

            errorMessage = (e as Error).message
            saveSuccess = false
            saveCompleteSubType = SaveCompleteSubType.SAVE_FAILED
            void vscode.window.showErrorMessage(errorMessage)
            throw new ToolkitError(errorMessage, { code: 'Failed to Save' })
        } finally {
            const saveFileResponseMessage: SaveFileResponseMessage = {
                messageType: MessageType.RESPONSE,
                command: Command.SAVE_FILE,
                filePath: filePath,
                isSuccess: saveSuccess,
                failureReason: errorMessage,
                saveCompleteSubType: saveCompleteSubType,
            }
            await context.panel.webview.postMessage(saveFileResponseMessage)
        }
    })
}

/**
 * Handler for auto saving a file message from the webview.
 * This function performs the following tasks:
 * 1. It saves the file contents to the workspace.
 * 2. It handles the case when the change has resulted in a similar JSON (will not save if the
 * change is due to formatting or ordering changes that do not affect the JSON structure).
 * 3. It sends a response message back to the webview with the save status and any failure reason.
 * @returns {Promise<void>} A promise that resolves when the file has been saved.
 * @param request The request message containing the file contents and path.
 * @param context The webview context containing the necessary information for saving the file.
 */
export async function autoSaveFileMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    let saveCompleteSubType = SaveCompleteSubType.SAVE_FAILED
    let saveSuccess = false
    let errorMessage: string | undefined = undefined
    let previousAutoSaveFileContent: string | undefined = undefined

    // If filePath is empty, save contents in default template file
    const filePath = context.defaultTemplatePath

    try {
        if (context.autoSaveFileState[filePath]) {
            previousAutoSaveFileContent = context.autoSaveFileState[filePath].fileContents

            if (previousAutoSaveFileContent !== request.fileContents) {
                let previousState

                try {
                    previousState = JSON.parse(previousAutoSaveFileContent)
                } catch (e) {
                    previousState = {}
                }

                const currentState = JSON.parse(request.fileContents)

                if (!_.isEqual(previousState, currentState)) {
                    context.autoSaveFileState[filePath] = { fileContents: request.fileContents }

                    await saveWorkspace(context, request.fileContents)
                    saveCompleteSubType = SaveCompleteSubType.SAVED
                } else {
                    saveCompleteSubType = SaveCompleteSubType.SAVE_SKIPPED_SAME_JSON
                }
            } else {
                saveCompleteSubType = SaveCompleteSubType.SAVE_SKIPPED_SAME_CONTENT
            }
            saveSuccess = true
        } else {
            throw new Error('Previous state of file not found')
        }
    } catch (e) {
        if (previousAutoSaveFileContent !== undefined) {
            context.autoSaveFileState[filePath] = { fileContents: previousAutoSaveFileContent }
        }

        errorMessage = (e as Error).message
        saveSuccess = false
        saveCompleteSubType = SaveCompleteSubType.SAVE_FAILED
        void vscode.window.showErrorMessage(errorMessage)
        throw new ToolkitError(errorMessage, { code: 'Failed to Auto Save' })
    } finally {
        const saveFileResponseMessage: SaveFileResponseMessage = {
            messageType: MessageType.RESPONSE,
            command: Command.AUTO_SAVE_FILE,
            filePath: filePath,
            isSuccess: saveSuccess,
            failureReason: errorMessage,
            saveCompleteSubType: saveCompleteSubType,
        }
        await context.panel.webview.postMessage(saveFileResponseMessage)
    }
}

/**
 * Saves to the workspace with the provided file contents.
 * @param context The webview context containing the necessary information for saving the file.
 * @param fileContents The file contents to save.
 */
async function saveWorkspace(context: WebviewContext, fileContents: string) {
    context.autoSaveFileState[context.defaultTemplatePath] = { fileContents: fileContents }

    const edit = new vscode.WorkspaceEdit()
    // Just replace the entire document every time for this example extension.
    // A more complete extension should compute minimal edits instead.
    edit.replace(context.textDocument.uri, new vscode.Range(0, 0, context.textDocument.lineCount, 0), fileContents)

    await vscode.workspace.applyEdit(edit)
}
