/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import type { extcontext } from '../../modules.gen'

import { getLogger } from '../../shared/logger'
import * as vscode from 'vscode'
import { TelemetryService } from '../../shared/telemetry/telemetryService'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { VueWebview, VueWebviewPanel } from '../../webviews/main'
import { telemetry } from '../../shared/telemetry/telemetry'

export interface FeedbackMessage {
    comment: string
    sentiment: string
}

export class FeedbackWebview extends VueWebview {
    public readonly id = 'submitFeedback'
    public readonly source = 'src/feedback/vue/index.js'

    public constructor(private readonly telemetry: TelemetryService) {
        super()
    }

    public async submit(message: FeedbackMessage): Promise<string | void> {
        const logger = getLogger()

        if (!message.sentiment) {
            return 'Choose a reaction (smile/frown)'
        }

        try {
            await this.telemetry.postFeedback({
                comment: message.comment,
                sentiment: message.sentiment,
            })
        } catch (err) {
            const errorMessage = (err as Error).message || 'Failed to submit feedback'
            logger.error(`feedback failed: "${message.sentiment}": ${errorMessage}`)

            telemetry.feedback_result.emit({ result: 'Failed' })

            return errorMessage
        }

        logger.info(`feedback sent: "${message.sentiment}"`)

        telemetry.feedback_result.emit({ result: 'Succeeded' })

        this.dispose()

        vscode.window.showInformationMessage(
            localize('AWS.message.info.submitFeedback.success', 'Thanks for the feedback!')
        )
    }
}

const Panel = VueWebview.compilePanel(FeedbackWebview)

let activeWebview: VueWebviewPanel | undefined

export async function submitFeedback(context: extcontext) {
    activeWebview ??= new Panel(context.extensionContext, globals.telemetry)

    const webviewPanel = await activeWebview.show({
        title: localize('AWS.submitFeedback.title', 'Send Feedback'),
        cssFiles: ['submitFeedback.css'],
    })

    webviewPanel.onDidDispose(() => (activeWebview = undefined))
}
