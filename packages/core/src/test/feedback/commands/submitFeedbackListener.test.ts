/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetryService } from '../../../shared/telemetry/telemetryService'

import * as assert from 'assert'
import { FeedbackWebview } from '../../../feedback/vue/submitFeedback'
import sinon from 'sinon'
import { waitUntil } from '../../../shared'

const comment =
    'This is a detailed feedback comment that meets the minimum length requirement. ' +
    'It includes specific information about the issue, steps to reproduce, expected behavior, and actual behavior. ' +
    'This comment is long enough to pass the 188 character validation rule.'
const sentiment = 'Positive'
const message = { command: 'submitFeedback', comment: comment, sentiment: sentiment }
const shortComment = 'This is a short comment'
const shortMessage = { command: 'submitFeedback', comment: shortComment, sentiment: sentiment }

describe('submitFeedbackListener', function () {
    let mockTelemetry: TelemetryService

    beforeEach(function () {
        mockTelemetry = {} as any as TelemetryService
    })

    const testCases = [
        { productName: 'Amazon Q', expectedError: 'Expected failure' },
        { productName: 'AWS Toolkit', expectedError: 'Expected failure' },
    ]
    for (const { productName, expectedError } of testCases) {
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

        it(`validates ${productName} feedback comment length is at least 188 characters`, async function () {
            const postStub = sinon.stub()
            mockTelemetry.postFeedback = postStub
            const webview = new FeedbackWebview(mockTelemetry, productName)
            const result = await webview.submit(shortMessage)
            assert.strictEqual(result, 'Please add atleast 100 characters in the template describing your issue.')
            assert.strictEqual(postStub.called, false, 'postFeedback should not be called for short comments')
        })
    }
})
