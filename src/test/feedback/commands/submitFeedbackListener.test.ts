/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { anything, deepEqual, instance, mock, verify, when } from '../../utilities/mockito'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import * as assert from 'assert'
import { FeedbackWebview } from '../../../feedback/vue/submitFeedback'

const comment = 'comment'
const sentiment = 'Positive'
const message = { command: 'submitFeedback', comment: comment, sentiment: sentiment }

describe('submitFeedbackListener', function () {
    let mockTelemetry: TelemetryService

    beforeEach(function () {
        mockTelemetry = mock()
    })

    it('submits feedback, disposes, and shows message on success', async function () {
        const webview = new FeedbackWebview(instance(mockTelemetry))
        await webview.submit(message)

        verify(mockTelemetry.postFeedback(deepEqual({ comment: comment, sentiment: sentiment }))).once()
        assert.ok(webview.isDisposed)
    })

    it('submits feedback and posts failure message on failure', async function () {
        const error = 'Expected failure'

        when(mockTelemetry.postFeedback(anything())).thenThrow(new Error(error))

        const webview = new FeedbackWebview(instance(mockTelemetry))
        const result = await webview.submit(message)

        assert.strictEqual(result, error)
    })
})
