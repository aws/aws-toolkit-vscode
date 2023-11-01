/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { SaveFileRequestMessage, SaveFileResponseMessage, WebviewContext, Response } from '../types'

export function saveFileMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    const sendSuccessMessage = () => {
        const saveFileSuccessMessage: SaveFileResponseMessage = {
            response: Response.SAVE_FILE,
            eventId: request.eventId,
            status: true,
        }
        context.panel.webview.postMessage(saveFileSuccessMessage)
    }
    const sendFailMessage = () => {
        const saveFileFailMessage: SaveFileResponseMessage = {
            response: Response.SAVE_FILE,
            eventId: request.eventId,
            status: false,
        }
        context.panel.webview.postMessage(saveFileFailMessage)
    }
    // TODO be smarter about how this check happens; check external files as needed
    if (!context.textDocument.isDirty) {
        const contents = Buffer.from(request.fileContents, 'utf8')
        const filePath =
            request.filePath === '' ? context.defaultTemplatePath : context.workSpacePath + '/' + request.filePath
        context.fileWatchs[filePath] = { fileContents: request.fileContents }
        const uri = vscode.Uri.file(filePath)
        try {
            vscode.workspace.fs.writeFile(uri, contents)
            sendSuccessMessage()
        } catch (exception) {
            sendFailMessage()
        }
    } else {
        // TODO
    }
}
