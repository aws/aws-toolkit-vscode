/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { assertTelemetryCurried } from '../../testUtil'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import { TelemetryHelper } from '../../../codewhisperer/util/telemetryHelper'

describe('telemetryHelper', function () {
    describe('getSuggestionState', function () {
        let telemetryHelper = new TelemetryHelper()
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            telemetryHelper = new TelemetryHelper()
        })

        it('user event is discard when recommendation state is Discarded with accept index = -1', function () {
            const actual = telemetryHelper.getSuggestionState(0, -1, new Map([[0, 'Discard']]))
            assert.strictEqual(actual, 'Discard')
        })

        it('user event is reject when recommendation state is Showed with accept index = -1', function () {
            const actual = telemetryHelper.getSuggestionState(0, -1, new Map([[0, 'Showed']]))
            assert.strictEqual(actual, 'Reject')
        })

        it('user event is Accept when recommendation state is Showed with accept index matches', function () {
            const actual = telemetryHelper.getSuggestionState(0, 0, new Map([[0, 'Showed']]))
            assert.strictEqual(actual, 'Accept')
        })

        it('user event is Ignore when recommendation state is Showed with accept index does not match', function () {
            const actual = telemetryHelper.getSuggestionState(0, 1, new Map([[0, 'Showed']]))
            assert.strictEqual(actual, 'Ignore')
        })

        it('user event is Unseen when recommendation state is not Showed, is not Unseen when recommendation is showed', function () {
            const actual0 = telemetryHelper.getSuggestionState(0, 1, new Map([[1, 'Showed']]))
            assert.strictEqual(actual0, 'Unseen')
            const actual1 = telemetryHelper.getSuggestionState(1, 1, new Map([[1, 'Showed']]))
            assert.strictEqual(actual1, 'Accept')
        })

        it('user event is Filter when recommendation state is Filter', function () {
            const actual = telemetryHelper.getSuggestionState(0, 1, new Map([[0, 'Filter']]))
            assert.strictEqual(actual, 'Filter')
        })

        it('user event is Empty when recommendation state is Empty', function () {
            const actual = telemetryHelper.getSuggestionState(0, 1, new Map([[0, 'Empty']]))
            assert.strictEqual(actual, 'Empty')
        })
    })

    describe('recordUserDecisionTelemetry', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })
        it('Should call telemetry record for each recommendations with proper arguments', async function () {
            const telemetryHelper = new TelemetryHelper()
            const response = [{ content: "print('Hello')" }]
            const requestId = 'test_x'
            const sessionId = 'test_x'
            telemetryHelper.completionType = 'Line'
            telemetryHelper.triggerType = 'AutoTrigger'
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userDecision')
            const suggestionState = new Map<number, string>([[0, 'Showed']])
            telemetryHelper.recordUserDecisionTelemetry(requestId, sessionId, response, 0, 'python', 0, suggestionState)
            assertTelemetry({
                codewhispererRequestId: 'test_x',
                codewhispererSessionId: 'test_x',
                codewhispererPaginationProgress: 0,
                codewhispererTriggerType: 'AutoTrigger',
                codewhispererSuggestionIndex: 0,
                codewhispererSuggestionState: 'Accept',
                codewhispererSuggestionReferenceCount: 0,
                codewhispererCompletionType: 'Line',
                codewhispererLanguage: 'python',
            })
        })
    })
})
