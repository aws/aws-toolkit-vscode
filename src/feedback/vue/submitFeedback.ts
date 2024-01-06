/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import { ExtContext } from '../../shared/extensions'

import { getLogger } from '../../shared/logger'
import * as vscode from 'vscode'
import { TelemetryService } from '../../shared/telemetry/telemetryService'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { VueWebview, VueWebviewPanel } from '../../webviews/main'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Commands, VsCodeCommandArg, placeholder } from '../../shared/vscode/commands2'
import { transformByQState } from '../../codewhisperer/models/model'

export interface FeedbackMessage {
    comment: string
    sentiment: string
}

export class FeedbackWebview extends VueWebview {
    public readonly id = 'submitFeedback'
    public readonly source = 'src/feedback/vue/index.js'

    public constructor(private readonly telemetry: TelemetryService, private readonly feedbackName: string) {
        super()
    }
    public async getFeedbackName(): Promise<string | void> {
        return this.feedbackName
    }

    public async submit(message: FeedbackMessage): Promise<string | void> {
        const logger = getLogger()

        if (!message.sentiment) {
            return 'Choose a reaction (smile/frown)'
        }

        const jobId = transformByQState.getJobId()
        if (jobId !== '') {
            message.comment = `${message.comment}\n\nQ CodeTransform jobId: ${jobId}`
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

type FeedbackId = 'AWS Toolkit' | 'CodeWhisperer' | 'Amazon Q' | 'Application Composer'

export const submitFeedback = Commands.declare(
    { id: 'aws.submitFeedback', autoconnect: false },
    (context: ExtContext) => async (_: VsCodeCommandArg, id: FeedbackId) => {
        if (_ !== placeholder) {
            // No args exist, we must supply them
            id = 'AWS Toolkit'
        }
        await showFeedbackView(context, id)
    }
)

let activeWebview: VueWebviewPanel | undefined

export async function showFeedbackView(context: ExtContext, feedbackName: string) {
    const Panel = VueWebview.compilePanel(FeedbackWebview)
    activeWebview ??= new Panel(context.extensionContext, globals.telemetry, feedbackName)

    const webviewPanel = await activeWebview.show({
        title: localize('AWS.submitFeedback.title', 'Send Feedback'),
        cssFiles: ['submitFeedback.css'],
    })

    webviewPanel.onDidDispose(() => (activeWebview = undefined))
}
