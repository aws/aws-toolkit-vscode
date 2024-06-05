/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, FileChangedMessage, MessageType, WebviewContext } from '../types'
import vscode from 'vscode'
import { fsCommon } from '../../srcShared/fs'

/**
 * Function to add a watcher on the file that was opened. The watcher will notify Threat Composer
 * view when a change occurs to the file externally.
 * If the change occurs due to
 *    a user save action, file change is ignored.
 *    an auto save that is persisted as AutoSave is turned on in VSCode settings, update file state.
 *    an external file change,
 *       if a local, unsaved change exist in Threat Composer, the file change is ignored.
 *       if no unsaved local changes exist, the view is notified of the external file change.
 * @param context: The Webview Context that contain the details of the file and the webview
 */
export function addFileWatchMessageHandler(context: WebviewContext) {
    const filePath = context.defaultTemplatePath
    const fileName = context.defaultTemplateName

    context.disposables.push(
        vscode.workspace.onDidChangeTextDocument(async e => {
            const fileContents = await fsCommon.readFileAsString(filePath)

            if (fileContents !== context.fileWatches[filePath].fileContents) {
                if (fileContents === context.autoSaveFileWatches[filePath].fileContents) {
                    context.fileWatches[filePath] = { fileContents: fileContents }
                } else if (
                    context.fileWatches[filePath].fileContents === context.autoSaveFileWatches[filePath].fileContents
                ) {
                    console.log('DocumentChanged')
                    await broadcastFileChange(fileName, filePath, fileContents, context.panel)
                    context.fileWatches[filePath] = { fileContents: fileContents }
                    context.autoSaveFileWatches[filePath] = { fileContents: fileContents }
                } else {
                    console.error('Document Changed externally before local changes are saved')
                }
            }
        })
    )
}

/**
 * Helper Function to broadcast the file change to the Threat Composer view
 * @param fileName: Name of the file that was changed
 * @param filePath: The path to the file
 * @param fileContents: The updated file contents
 * @param panel: the panel which contains the webview to be notified.
 */
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
