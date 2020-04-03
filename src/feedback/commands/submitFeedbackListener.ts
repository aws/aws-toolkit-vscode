/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { _Blob } from 'aws-sdk/clients/lambda'
import { getLogger, Logger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { TelemetryService } from '../../shared/telemetry/telemetryService'
import { localize } from '../../shared/utilities/vsCodeUtils'

export interface FeedbackMessage {
    command: string
    comment: string
    sentiment: string
}

export interface FeedbackPanel {
    postMessage(message: any): Thenable<boolean>
    dispose(): any
}

export interface Window {
    showInformationMessage(message: string): Thenable<string | undefined>
}

export function submitFeedbackListener(panel: FeedbackPanel, window: Window, telemetryService: TelemetryService) {
    const logger: Logger = getLogger()

    return async (message: FeedbackMessage) => {
        switch (message.command) {
            case 'submitFeedback':
                logger.info(`Submitting ${message.sentiment} feedback`)

                try {
                    await telemetryService.postFeedback({
                        comment: message.comment,
                        sentiment: message.sentiment,
                    })
                } catch (err) {
                    const errorMessage = (err as Error).message || 'Failed to submit feedback'
                    logger.error(`Failed to submit ${message.sentiment} feedback: ${errorMessage}`)
                    panel.postMessage({ statusCode: 'Failure', error: errorMessage })

                    telemetry.recordFeedbackResult({ result: 'Failed' })

                    return
                }

                logger.info(`Successfully submitted ${message.sentiment} feedback`)

                telemetry.recordFeedbackResult({ result: 'Succeeded' })

                panel.dispose()

                window.showInformationMessage(
                    localize('AWS.message.info.submitFeedback.success', 'Thanks for the feedback!')
                )

                return
        }
    }
}
