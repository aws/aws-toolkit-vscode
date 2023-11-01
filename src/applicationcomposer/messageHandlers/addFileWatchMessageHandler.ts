/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AddFileWatchRequestMessage,
    AddFileWatchResponseMessage,
    FileChangedResponseMessage,
    Response,
    WebviewContext,
} from '../types'
import vscode from 'vscode'
import { getFileNameFromPath } from '../utils/getFileNameFromPath'
import { readFile } from '../fileSystemAccess/readFile'

export async function addFileWatchMessageHandler(request: AddFileWatchRequestMessage, context: WebviewContext) {
    const addFileWatchResponseMessage: AddFileWatchResponseMessage = {
        response: Response.ADD_FILE_WATCH,
        eventId: request.eventId,
        status: true,
    }
    context.panel.webview.postMessage(addFileWatchResponseMessage)

    const filePath = context.defaultTemplatePath
    const fileName = getFileNameFromPath(filePath)
    const fileWatch = vscode.workspace.createFileSystemWatcher(filePath)
    fileWatch.onDidChange(async () => {
        const fileContents = (await readFile(filePath, context)) ?? ''
        if (fileContents !== context.fileWatchs[filePath].fileContents) {
            const fileChangedResponseMessage: FileChangedResponseMessage = {
                response: Response.FILE_CHANGED,
                fileName: fileName,
                fileContents: fileContents,
            }
            context.panel.webview.postMessage(fileChangedResponseMessage)
            context.fileWatchs[filePath] = { fileContents: fileContents }
        }
    })
}
