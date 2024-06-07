/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, FileChangedMessage, MessageType, WebviewContext } from '../types'
import vscode from 'vscode'
import { fsCommon } from '../../srcShared/fs'

/**
 * Function to call when the text document has been modified
 * If the change occurs due to
 *    a user save action, file change is ignored.
 *    an auto save that is persisted as a result of the 'AutoSave' setting turned on in VSCode,
 *      update file state.
 *    an external file change,
 *       if a local, unsaved change exist in Threat Composer, the file change is ignored and the
 *          user is warned.
 *       if no unsaved local changes exist, the web view is notified of the external file change.
 * @param context: The Webview Context that contain the details of the file and the webview
 */
export async function onFileChanged(context: WebviewContext) {
    const filePath = context.defaultTemplatePath
    const fileName = context.defaultTemplateName

    const fileContents = await fsCommon.readFileAsString(filePath)

    // If the change event is due to a save action by the user, this trigger can be ignored.
    if (fileContents !== context.fileStates[filePath].fileContents) {
        if (fileContents === context.autoSaveFileState[filePath].fileContents) {
            // Contents of the file are the same as that of the 'autoSaveFileState'. This
            // means that the file change was triggered as a result of auto save, we
            // don't have to notify the webview However, 'fileStates' need to be updated.
            context.fileStates[filePath] = { fileContents: fileContents }
        } else if (context.fileStates[filePath].fileContents === context.autoSaveFileState[filePath].fileContents) {
            // There are no unsaved local changes in the file, so the file change is
            // triggered due to an external change in the file. This must be propagated
            // to the webview, so that it can be updated.
            console.log('DocumentChanged')
            await broadcastFileChange(fileName, filePath, fileContents, context.panel)
            context.fileStates[filePath] = { fileContents: fileContents }
            context.autoSaveFileState[filePath] = { fileContents: fileContents }
        } else {
            // There are unsaved local changes in the file, and the file has been
            // changed externally. The file is currently in a dirty state. This file
            // change trigger is ignored. When the user decides to save the local
            // changes, they can decide to overwrite the file.
            void vscode.window.showWarningMessage(`${fileName}  has been modified externally.`)
            console.warn('Document Changed externally before local changes are saved')
        }
    }
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
