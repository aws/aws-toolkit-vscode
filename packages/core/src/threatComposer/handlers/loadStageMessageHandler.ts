/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoadStageMessage as LoadStageMessage, WebviewContext } from '../types'

/**
 * Handler for managing the various stages of the webview.
 * As the webview completes each stage, it sends a message to the extension, which updates the
 * Threat Composer load notification.
 * @param message The message containing the load stage.
 * @param context The context object containing the necessary information for the webview.
 */
export async function loadStageMessageHandler(message: LoadStageMessage, context: WebviewContext) {
    switch (message.loadStage) {
        case 'API_LOADED':
            if (context.loaderNotification) {
                context.loaderNotification.progress.report({ increment: 20 })
            }
            break
        case 'RENDER_COMPLETE':
            if (context.loaderNotification) {
                context.loaderNotification.progress.report({ increment: 30 })
                if (context.loaderNotification.promiseResolve) {
                    context.loaderNotification.promiseResolve()
                }
            }
            break
    }
}
