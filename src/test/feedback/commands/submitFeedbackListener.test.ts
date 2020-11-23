/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { anything, deepEqual, instance, mock, verify, when } from '../../utilities/mockito'
import { FeedbackPanel, submitFeedbackListener, Window } from '../../../feedback/commands/submitFeedbackListener'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'

const COMMENT = 'comment'
const SENTIMENT = 'Positive'
const message = { command: 'submitFeedback', comment: COMMENT, sentiment: SENTIMENT }

describe('submitFeedbackListener', () => {
    let mockPanel: FeedbackPanel
    let mockWindow: Window
    let mockTelemetry: TelemetryService

    beforeEach(() => {
        mockPanel = mock()
        mockWindow = mock()
        mockTelemetry = mock()
    })

    it('submits feedback, disposes, and shows message on success', async () => {
        const listener = submitFeedbackListener(instance(mockPanel), instance(mockWindow), instance(mockTelemetry))
        await listener(message)

        verify(mockTelemetry.postFeedback(deepEqual({ comment: COMMENT, sentiment: SENTIMENT }))).once()
        verify(mockPanel.dispose()).once()
        verify(mockWindow.showInformationMessage('Thanks for the feedback!')).once()
    })

    it('submits feedback and posts failure message on failure', async () => {
        const error = 'Expected failure'

        when(mockTelemetry.postFeedback(anything())).thenThrow(new Error(error))

        const listener = submitFeedbackListener(instance(mockPanel), instance(mockWindow), instance(mockTelemetry))
        await listener(message)

        verify(mockPanel.postMessage(deepEqual({ statusCode: 'Failure', error: error }))).once()
    })
})
