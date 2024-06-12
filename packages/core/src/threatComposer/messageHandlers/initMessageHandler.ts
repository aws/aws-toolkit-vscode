/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, MessageType, WebviewContext } from '../types'
import { broadcastFileChange } from './addFileWatchMessageHandler'

/**
 * Handler for when the Threat Composer view is ready.
 * This handler is used to initialize the webview with the contents of the Threat Composer file
 * selected.
 * @param context The context object containing the necessary information for the webview.
 */
export async function initMessageHandler(context: WebviewContext) {
    const filePath = context.defaultTemplatePath

    try {
        const fileContents = context.textDocument.getText().toString()
        context.fileStates[filePath] = { fileContents: fileContents }
        context.autoSaveFileState[filePath] = { fileContents: fileContents }
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

/**
 * Handler for reloading the Threat Composer file.
 * This handler is used to reload the Threat Composer file with the latest contents.
 * @param context The context object containing the necessary information for the webview.
 */
export async function reloadMessageHandler(context: WebviewContext) {
    const filePath = context.defaultTemplatePath

    try {
        const fileContents = context.autoSaveFileState[filePath].fileContents
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
