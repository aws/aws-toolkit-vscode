/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { InitResponseMessage, Response, WebviewContext } from '../types'
import { getFileNameFromPath } from '../utils/getFileNameFromPath'

export function initMessageHandler(context: WebviewContext) {
    const filePath = context.defaultTemplatePath
    const responseMessage: InitResponseMessage = {
        response: Response.INIT,
        templateFileName: getFileNameFromPath(filePath),
        templateFilePath: filePath,
    }

    context.panel.webview.postMessage(responseMessage)
}
