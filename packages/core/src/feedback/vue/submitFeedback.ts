/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import * as vscode from 'vscode'
import { TelemetryService } from '../../shared/telemetry/telemetryService'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { VueWebview, VueWebviewPanel } from '../../webviews/main'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Commands, RegisteredCommand, VsCodeCommandArg, placeholder } from '../../shared/vscode/commands2'
import { transformByQState } from '../../codewhisperer/models/model'

export interface FeedbackMessage {
    comment: string
    sentiment: string
}

export class FeedbackWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/feedback/vue/index.js'
    public readonly id = 'submitFeedback'

    public constructor(private readonly telemetry: TelemetryService, private readonly feedbackName: string) {
        super(FeedbackWebview.sourcePath)
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

        void vscode.window.showInformationMessage(
            localize('AWS.message.info.submitFeedback.success', 'Thanks for the feedback!')
        )
    }
}

type FeedbackId = 'AWS Toolkit' | 'Amazon Q' | 'Application Composer' | 'Threat Composer'

let _submitFeedback: RegisteredCommand<(_: VsCodeCommandArg, id: FeedbackId) => Promise<void>> | undefined
export function submitFeedback(_: VsCodeCommandArg, id: FeedbackId) {
    if (_submitFeedback === undefined) {
        getLogger().error(
            'Attempted to access "submitFeedback" command, but it was never initialized.' +
                '\nThis should be initialized during extension activation.'
        )
        throw new Error("'submitFeedback' command was called programmitically, but its not registered.")
    }
    return _submitFeedback.execute(_, id)
}

export function registerSubmitFeedback(context: vscode.ExtensionContext, defaultId: FeedbackId, contextPrefix: string) {
    _submitFeedback = Commands.register(
        { id: `aws.${contextPrefix}.submitFeedback`, autoconnect: false },
        async (_: VsCodeCommandArg, id: FeedbackId) => {
            if (_ !== placeholder) {
                // No args exist, we must supply them
                id = defaultId
            }
            await showFeedbackView(context, id)
        }
    )
    getLogger().info(`initialized \'submitFeedback\' command with default feedback id: ${defaultId}`)

    return _submitFeedback
}

let activeWebview: VueWebviewPanel | undefined

export async function showFeedbackView(context: vscode.ExtensionContext, feedbackName: string) {
    const Panel = VueWebview.compilePanel(FeedbackWebview)
    activeWebview ??= new Panel(context, globals.telemetry, feedbackName)

    const webviewPanel = await activeWebview.show({
        title: localize('AWS.submitFeedback.title', 'Send Feedback'),
        cssFiles: ['submitFeedback.css'],
    })

    webviewPanel.onDidDispose(() => (activeWebview = undefined))
}
