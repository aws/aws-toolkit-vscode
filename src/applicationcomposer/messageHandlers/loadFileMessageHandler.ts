/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoadFileRequestMessage, LoadFileResponseMessage, Response, WebviewContext } from '../types'
import { readFile } from '../fileSystemAccess/readFile'
import { getFileNameFromPath } from '../utils/getFileNameFromPath'

export async function loadFileMessageHandler(request: LoadFileRequestMessage, context: WebviewContext) {
    let loadFileResponseMessage: LoadFileResponseMessage
    try {
        switch (request.fileName) {
            case '': { // initial load file request
                const initFileContents = await readFile(context.defaultTemplatePath, context)
                context.fileWatchs[context.defaultTemplatePath] = { fileContents: initFileContents ?? '' }
                loadFileResponseMessage = {
                    response: Response.LOAD_FILE,
                    eventId: request.eventId,
                    fileName: getFileNameFromPath(context.defaultTemplatePath),
                    filePath: context.defaultTemplatePath,
                    initFileContents: initFileContents ?? '',
                    isSuccess: true,
                }
                break
            }
            default: {
                const filePath = context.workSpacePath + '/' + request.fileName
                const fileContents = await readFile(filePath, context)
                loadFileResponseMessage = {
                    response: Response.LOAD_FILE,
                    eventId: request.eventId,
                    fileName: request.fileName,
                    filePath: filePath,
                    initFileContents: fileContents ?? '',
                    isSuccess: fileContents === undefined ? false : true,
                }
                break
            }
        }
    } catch (e) {
        loadFileResponseMessage = {
            response: Response.LOAD_FILE,
            eventId: request.eventId,
            fileName: request.fileName,
            filePath: '',
            initFileContents: '',
            isSuccess: false,
        }
    }
    context.panel.webview.postMessage(loadFileResponseMessage)
}
