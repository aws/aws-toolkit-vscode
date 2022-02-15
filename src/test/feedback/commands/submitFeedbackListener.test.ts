/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { anything, deepEqual, instance, mock, verify, when } from '../../utilities/mockito'
import { submitFeedbackMessage } from '../../../feedback/commands/submitFeedback'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import { Window } from '../../../shared/vscode/window'
import { WebviewServer } from '../../../webviews/server'

const COMMENT = 'comment'
const SENTIMENT = 'Positive'
const message = { command: 'submitFeedback', comment: COMMENT, sentiment: SENTIMENT }

describe('submitFeedbackListener', function () {
    let mockWebviewServer: WebviewServer
    let mockWindow: Window
    let mockTelemetry: TelemetryService

    beforeEach(function () {
        mockWebviewServer = mock()
        mockWindow = mock()
        mockTelemetry = mock()
    })

    it('submits feedback, disposes, and shows message on success', async function () {
        await submitFeedbackMessage(instance(mockWebviewServer), message, {
            telemetryService: instance(mockTelemetry),
            window: instance(mockWindow),
        })

        verify(mockTelemetry.postFeedback(deepEqual({ comment: COMMENT, sentiment: SENTIMENT }))).once()
        verify(mockWebviewServer.dispose()).once()
        verify(mockWindow.showInformationMessage('Thanks for the feedback!')).once()
    })

    it('submits feedback and posts failure message on failure', async function () {
        const error = 'Expected failure'

        when(mockTelemetry.postFeedback(anything())).thenThrow(new Error(error))

        await submitFeedbackMessage(instance(mockWebviewServer), message, {
            telemetryService: instance(mockTelemetry),
            window: instance(mockWindow),
        })

        verify(mockWebviewServer.postMessage(deepEqual({ statusCode: 'Failure', error: error }))).once()
    })
})
