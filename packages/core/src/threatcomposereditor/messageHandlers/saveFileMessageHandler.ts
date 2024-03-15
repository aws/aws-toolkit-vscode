/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { SaveFileRequestMessage, SaveFileResponseMessage, MessageType, Command, WebviewContext } from '../types'
import path from 'path'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'

export async function saveFileMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    let saveFileResponseMessage: SaveFileResponseMessage | undefined = undefined

    // If filePath is empty, save contents in default template file
    const filePath = context.defaultTemplatePath

    await telemetry.threatcomposer_fileSaved.run(async span => {
        try {
            if (!context.textDocument.isDirty) {
                context.fileWatches[filePath] = { fileContents: request.fileContents }

                const edit = new vscode.WorkspaceEdit()
                // Just replace the entire document every time for this example extension.
                // A more complete extension should compute minimal edits instead.
                edit.replace(
                    context.textDocument.uri,
                    new vscode.Range(0, 0, context.textDocument.lineCount, 0),
                    request.fileContents
                )

                await vscode.workspace.applyEdit(edit)
                await vscode.window.showInformationMessage('Threat Composer JSON has bees saved')

                saveFileResponseMessage = {
                    messageType: MessageType.RESPONSE,
                    command: Command.SAVE_FILE,
                    filePath: filePath,
                    isSuccess: true,
                }
            } else {
                // TODO: If the template file is dirty, do we pop out a warning window?
                throw new Error(`Cannot save latest contents in ${path.basename(filePath)}`)
            }
        } catch (e) {
            saveFileResponseMessage = {
                messageType: MessageType.RESPONSE,
                command: Command.SAVE_FILE,
                filePath: filePath,
                isSuccess: false,
                failureReason: (e as Error).message,
            }
            throw new ToolkitError((e as Error).message, { code: 'Failed to Save' })
        }
    })

    if (saveFileResponseMessage) {
        await context.panel.webview.postMessage(saveFileResponseMessage)
    }
}
