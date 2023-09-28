/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

    const testCases = [
        { productName: 'CodeWhisperer', expectedError: 'Expected failure' },
        { productName: 'AWS Toolkit', expectedError: 'Expected failure' },
    ]
    testCases.forEach(({ productName, expectedError }) => {
        it(`submits feedback for ${productName}, disposes, and handles errors`, async function () {
            const webview = new FeedbackWebview(instance(mockTelemetry), productName)
            await webview.submit(message)
            verify(mockTelemetry.postFeedback(deepEqual({ comment: comment, sentiment: sentiment }))).once()
            assert.ok(webview.isDisposed)
        })
        it(`submits feedback for ${productName}, disposes, and handles errors`, async function () {
            const error = 'Expected failure'
            when(mockTelemetry.postFeedback(anything())).thenThrow(new Error(error))
            const webview = new FeedbackWebview(instance(mockTelemetry), productName)
            const result = await webview.submit(message)
            assert.strictEqual(result, error)
        })
    })
})
