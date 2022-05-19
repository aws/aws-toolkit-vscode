/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { anything, deepEqual, instance, mock, verify, when } from '../../utilities/mockito'
import { FeedbackWebview } from '../../../feedback/commands/submitFeedback'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import * as assert from 'assert'

const COMMENT = 'comment'
const SENTIMENT = 'Positive'
const message = { command: 'submitFeedback', comment: COMMENT, sentiment: SENTIMENT }

describe('submitFeedbackListener', function () {
    let mockTelemetry: TelemetryService

    beforeEach(function () {
        mockTelemetry = mock()
    })

    it('submits feedback, disposes, and shows message on success', async function () {
        const webview = new FeedbackWebview(instance(mockTelemetry))
        const disposed = new Promise<boolean>((resolve, reject) => {
            setTimeout(() => reject(false), 5000)
            webview.onDidDispose(() => resolve(true))
        })
        await webview.submit(message)

        verify(mockTelemetry.postFeedback(deepEqual({ comment: COMMENT, sentiment: SENTIMENT }))).once()
        assert.ok(await disposed)
    })

    it('submits feedback and posts failure message on failure', async function () {
        const error = 'Expected failure'

        when(mockTelemetry.postFeedback(anything())).thenThrow(new Error(error))

        const webview = new FeedbackWebview(instance(mockTelemetry))
        const result = await webview.submit(message)

        assert.strictEqual(result, error)
    })
})
