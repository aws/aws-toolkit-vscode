/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import { ExtContext } from '../../shared/extensions'

import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { TelemetryService } from '../../shared/telemetry/telemetryService'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window as VsCodeWindow } from '../../shared/vscode/window'
import { compileVueWebview } from '../../webviews/main'
import { WebviewServer } from '../../webviews/server'

export interface FeedbackMessage {
    comment: string
    sentiment: string
}

const VueWebview = compileVueWebview({
    id: 'submitFeedback',
    title: localize('AWS.submitFeedback.title', 'Send Feedback'),
    webviewJs: 'feedbackVue.js',
    commands: {
        feedback: function (message: FeedbackMessage) {
            submitFeedbackMessage(this, message)
        },
    },
    cssFiles: ['submitFeedback.css'],
    start: () => {},
})
export class FeedbackWebview extends VueWebview {}

let activeWebview: FeedbackWebview | undefined

export async function submitFeedback(context: ExtContext) {
    if (activeWebview) {
        activeWebview.panel?.reveal(activeWebview.panel.viewColumn)
    } else {
        activeWebview = new FeedbackWebview(context)
        await activeWebview.start()
        // note: `start` lasts for the webview's whole lifecycle
        //       the line below will be called after the webview is closed
        activeWebview = undefined
    }
}

export async function submitFeedbackMessage(
    server: WebviewServer,
    message: FeedbackMessage,
    constructs: {
        window: VsCodeWindow
        telemetryService: TelemetryService
    } = {
        window: VsCodeWindow.vscode(),
        telemetryService: globals.telemetry,
    }
) {
    const logger = getLogger()

    if (!message.sentiment) {
        logger.error(`feedback failed, invalid sentiment: "${message.sentiment}"`)
        server.postMessage({ statusCode: 'Failure', error: 'Choose a reaction (smile/frown)' })
        return
    }

    try {
        await constructs.telemetryService.postFeedback({
            comment: message.comment,
            sentiment: message.sentiment,
        })
    } catch (err) {
        const errorMessage = (err as Error).message || 'Failed to submit feedback'
        logger.error(`feedback failed: "${message.sentiment}": ${errorMessage}`)
        server.postMessage({ statusCode: 'Failure', error: errorMessage })

        telemetry.recordFeedbackResult({ result: 'Failed' })

        return
    }

    logger.info(`feedback sent: "${message.sentiment}"`)

    telemetry.recordFeedbackResult({ result: 'Succeeded' })

    server.dispose()

    constructs.window.showInformationMessage(
        localize('AWS.message.info.submitFeedback.success', 'Thanks for the feedback!')
    )

    return
}
