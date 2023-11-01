/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoadFileRequestMessage, LoadFileResponseMessage, Response, WebviewContext } from '../types'
import { readFile } from '../fileSystemAccess/readFile'
import { getFileNameFromPath } from '../utils/getFileNameFromPath'

export async function loadFileMessageHandler(request: LoadFileRequestMessage, context: WebviewContext) {
    const initFileContents = await readFile(context.defaultTemplatePath, context)
    context.fileWatchs[context.defaultTemplatePath] = { fileContents: initFileContents ?? '' }
    const loadFileResponseMessage: LoadFileResponseMessage = {
        response: Response.LOAD_FILE,
        eventId: request.eventId,
        fileName: getFileNameFromPath(context.defaultTemplatePath),
        filePath: context.defaultTemplatePath,
        initFileContents: initFileContents ?? '',
    }
    context.panel.webview.postMessage(loadFileResponseMessage)
}
