/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType, FileChangedMessage, Command, WebviewContext } from '../types'
import vscode from 'vscode'

export function addFileWatchMessageHandler(context: WebviewContext) {
    const filePath = context.defaultTemplatePath
    const fileName = context.defaultTemplateName

    context.disposables.push(
        vscode.workspace.onDidChangeTextDocument(async e => {
            const fileContents = (await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))).toString()
            if (fileContents !== context.fileWatches[filePath].fileContents) {
                console.log('DocumentChanged')
                await broadcastFileChange(fileName, filePath, fileContents, context.panel)
                context.fileWatches[filePath] = { fileContents: fileContents }
            }
        })
    )
}

export async function broadcastFileChange(
    fileName: string,
    filePath: string,
    fileContents: string,
    panel: vscode.WebviewPanel
) {
    const fileChangedMessage: FileChangedMessage = {
        messageType: MessageType.BROADCAST,
        command: Command.FILE_CHANGED,
        fileName: fileName,
        fileContents: fileContents,
        filePath: filePath,
    }

    await panel.webview.postMessage(fileChangedMessage)
}
