/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoadFileRequestMessage, LoadFileResponseMessage, Response, WebviewContext } from '../types'
import vscode from 'vscode'

export async function loadFileMessageHandler(request: LoadFileRequestMessage, context: WebviewContext) {
    let loadFileResponseMessage: LoadFileResponseMessage
    try {
        switch (request.fileName) {
            case '': { // load default template file when 'fileName' is empty
                const initFileContents = (
                    await vscode.workspace.fs.readFile(vscode.Uri.file(context.defaultTemplatePath))
                ).toString()
                if (initFileContents === undefined) {
                    throw new Error(`Cannot read file contents from ${context.defaultTemplatePath}`)
                }
                context.fileWatches[context.defaultTemplatePath] = { fileContents: initFileContents }
                loadFileResponseMessage = {
                    response: Response.LOAD_FILE,
                    eventId: request.eventId,
                    fileName: context.defaultTemplateName,
                    fileContents: initFileContents,
                    isSuccess: true,
                }
                break
            }
            default: {
                const filePath = context.workSpacePath + '/' + request.fileName
                const fileContents = (await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))).toString()
                loadFileResponseMessage = {
                    response: Response.LOAD_FILE,
                    eventId: request.eventId,
                    fileName: request.fileName,
                    fileContents: fileContents,
                    isSuccess: true,
                }
                break
            }
        }
    } catch (e) {
        loadFileResponseMessage = {
            response: Response.LOAD_FILE,
            eventId: request.eventId,
            fileName: request.fileName,
            fileContents: '',
            isSuccess: false,
            reason: (e as Error).message,
        }
    }
    context.panel.webview.postMessage(loadFileResponseMessage)
}
