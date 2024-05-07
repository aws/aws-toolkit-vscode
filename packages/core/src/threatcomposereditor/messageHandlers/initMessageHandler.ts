/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType, WebviewContext, Command } from '../types'
import { broadcastFileChange } from './addFileWatchMessageHandler'
// import vscode from 'vscode'

export async function initMessageHandler(context: WebviewContext) {
    const filePath = context.defaultTemplatePath

    try {
        const fileContents = context.textDocument.getText().toString()
        context.fileWatches[filePath] = { fileContents: fileContents }
        context.autoSaveFileWatches[filePath] = { fileContents: fileContents }
        await broadcastFileChange(context.defaultTemplateName, filePath, fileContents, context.panel)
        if (context.loaderNotification) {
            context.loaderNotification.progress.report({ increment: 20 })
        }
    } catch (e) {
        await context.panel.webview.postMessage({
            messageType: MessageType.RESPONSE,
            command: Command.INIT,
            filePath: filePath,
            isSuccess: false,
            failureReason: (e as Error).message,
        })
    }
}

export async function reloadMessageHandler(context: WebviewContext) {
    const filePath = context.defaultTemplatePath

    try {
        const fileContents = context.autoSaveFileWatches[filePath].fileContents
        await broadcastFileChange(context.defaultTemplateName, filePath, fileContents, context.panel)
    } catch (e) {
        await context.panel.webview.postMessage({
            messageType: MessageType.RESPONSE,
            command: Command.RELOAD,
            filePath: filePath,
            isSuccess: false,
            failureReason: (e as Error).message,
        })
    }
}
