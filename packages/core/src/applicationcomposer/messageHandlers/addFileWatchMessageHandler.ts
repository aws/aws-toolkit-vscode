/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AddFileWatchRequestMessage,
    AddFileWatchResponseMessage,
    MessageType,
    FileChangedMessage,
    Command,
    WebviewContext,
} from '../types'
import vscode from 'vscode'

export async function addFileWatchMessageHandler(request: AddFileWatchRequestMessage, context: WebviewContext) {
    let addFileWatchResponseMessage: AddFileWatchResponseMessage
    try {
        // we only file watch on default template file now
        if (context.defaultTemplateName !== request.fileName) {
            throw new Error('file watching is only allowed on default template file')
        }
        const filePath = context.defaultTemplatePath
        const fileName = context.defaultTemplateName
        const fileWatch = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(filePath, '*'))
        context.disposables.push(fileWatch)

        fileWatch.onDidChange(async () => {
            const fileContents = (await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))).toString()
            if (fileContents !== context.fileWatches[filePath].fileContents) {
                const fileChangedMessage: FileChangedMessage = {
                    messageType: MessageType.BROADCAST,
                    command: Command.FILE_CHANGED,
                    fileName: fileName,
                    fileContents: fileContents,
                }

                await context.panel.webview.postMessage(fileChangedMessage)
                context.fileWatches[filePath] = { fileContents: fileContents }
            }
        })

        addFileWatchResponseMessage = {
            messageType: MessageType.RESPONSE,
            command: Command.ADD_FILE_WATCH,
            eventId: request.eventId,
            isSuccess: true,
        }
    } catch (e) {
        addFileWatchResponseMessage = {
            messageType: MessageType.RESPONSE,
            command: Command.ADD_FILE_WATCH,
            eventId: request.eventId,
            isSuccess: false,
            failureReason: (e as Error).message,
        }
    }

    await context.panel.webview.postMessage(addFileWatchResponseMessage)
}
