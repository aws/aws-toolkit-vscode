/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoadStageMessage as LoadStageMessage, WebviewContext } from '../types'

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
