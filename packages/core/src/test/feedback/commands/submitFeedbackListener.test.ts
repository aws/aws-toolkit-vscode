/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetryService } from '../../../shared/telemetry/telemetryService'

import * as assert from 'assert'
import { FeedbackWebview } from '../../../feedback/vue/submitFeedback'
import sinon from 'sinon'
import { waitUntil } from '../../../shared'

const comment = 'comment'
const sentiment = 'Positive'
const message = { command: 'submitFeedback', comment: comment, sentiment: sentiment }

describe('submitFeedbackListener', function () {
    let mockTelemetry: TelemetryService

    beforeEach(function () {
        mockTelemetry = {} as any as TelemetryService
    })

    const testCases = [
        { productName: 'Amazon Q', expectedError: 'Expected failure' },
        { productName: 'AWS Toolkit', expectedError: 'Expected failure' },
    ]
    testCases.forEach(({ productName, expectedError }) => {
        it(`submits ${productName} feedback, disposes, and shows message on success`, async function () {
            const postStub = sinon.stub()
            mockTelemetry.postFeedback = postStub
            const webview = new FeedbackWebview(mockTelemetry, productName)
            await webview.submit(message)
            const gotArgs = await waitUntil(
                async () => {
                    return postStub.lastCall.args?.[0]
                },
                { interval: 100 }
            )
            assert.deepStrictEqual(gotArgs, { comment: comment, sentiment: sentiment })
            assert.ok(webview.isDisposed)
        })
        it(`submits ${productName} feedback and posts failure message on failure`, async function () {
            const postStub = sinon.stub().rejects(new Error(expectedError))
            mockTelemetry.postFeedback = postStub
            const webview = new FeedbackWebview(mockTelemetry, productName)
            const result = await webview.submit(message)
            assert.strictEqual(result, expectedError)
        })
    })
})
