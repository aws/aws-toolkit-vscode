/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { SaveFileRequestMessage, SaveFileResponseMessage, WebviewContext, Command, MessageType } from '../types'
import path from 'path'

export async function saveFileMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    let saveFileResponseMessage: SaveFileResponseMessage
    // If filePath is empty, save contents in default template file
    const filePath =
        request.filePath === '' ? context.defaultTemplatePath : path.join(context.workSpacePath, request.filePath)
    const normalizedPath = path.resolve(filePath)
    if (
        !normalizedPath.startsWith(path.resolve(context.workSpacePath) + path.sep) &&
        normalizedPath !== path.resolve(context.defaultTemplatePath)
    ) {
        await context.panel.webview.postMessage({
            messageType: MessageType.RESPONSE,
            command: Command.SAVE_FILE,
            eventId: request.eventId,
            filePath: filePath,
            isSuccess: false,
            failureReason: `Path is outside of workspace: ${request.filePath}`,
        } satisfies SaveFileResponseMessage)
        return
    }
    try {
        if (!context.textDocument.isDirty) {
            const contents = Buffer.from(request.fileContents, 'utf8')
            context.fileWatches[filePath] = { fileContents: request.fileContents }
            const uri = vscode.Uri.file(filePath)
            await vscode.workspace.fs.writeFile(uri, contents)
            saveFileResponseMessage = {
                messageType: MessageType.RESPONSE,
                command: Command.SAVE_FILE,
                eventId: request.eventId,
                filePath: filePath,
                isSuccess: true,
            }
        } else {
            // TODO: If the template file is dirty, do we pop out a warning window?
            throw new Error(`Cannot save latest contents in ${path.basename(request.filePath)}`)
        }
    } catch (e) {
        saveFileResponseMessage = {
            messageType: MessageType.RESPONSE,
            command: Command.SAVE_FILE,
            eventId: request.eventId,
            filePath: filePath,
            isSuccess: false,
            failureReason: (e as Error).message,
        }
    }

    await context.panel.webview.postMessage(saveFileResponseMessage)
}
