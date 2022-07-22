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

        it('user event is discard when recommendation 0 with accept index = -1 & recommendation prefix 0 does not match current code', function () {
            telemetryHelper.isPrefixMatched = [false, true]
            const actual = telemetryHelper.getSuggestionState(0, -1)
            assert.strictEqual(actual, 'Discard')
        })

        it('user event is reject when recommendation 0 with accept index = -1 & recommendation prefix 0 matches current code', function () {
            telemetryHelper.isPrefixMatched = [true, true]
            const actual = telemetryHelper.getSuggestionState(0, -1)
            assert.strictEqual(actual, 'Reject')
        })

        it('user event is discard when recommendation 1 with accept index = 1 & recommendation prefix 1 does not match code', function () {
            telemetryHelper.isPrefixMatched = [true, false]
            const actual = telemetryHelper.getSuggestionState(1, 1)
            assert.strictEqual(actual, 'Discard')
        })

        it('user event is Accept when recommendation 0 with accept index = 1 & recommendation prefix 0 matches code', function () {
            telemetryHelper.isPrefixMatched = [true, true]
            const actual = telemetryHelper.getSuggestionState(0, 0)
            assert.strictEqual(actual, 'Accept')
        })

        it('user event is Ignore when recommendation 0 with accept index = 1 & recommendation prefix 0 matches code', function () {
            telemetryHelper.isPrefixMatched = [true, true]
            const actual = telemetryHelper.getSuggestionState(0, 1)
            assert.strictEqual(actual, 'Ignore')
        })
    })

    describe('recordUserDecisionTelemetry', function () {
        it('Should call telemetry record for each recommendations with proper arguments', async function () {
            const telemetryHelper = new TelemetryHelper()
            const response = [{ content: "print('Hello')" }]
            const requestId = 'test_x'
            const sessionId = 'test_x'
            telemetryHelper.completionType = 'Line'
            telemetryHelper.triggerType = 'AutoTrigger'
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userDecision')
            const suggestionState = new Map<number, string>([[0, 'Showed']])
            await telemetryHelper.recordUserDecisionTelemetry(
                requestId,
                sessionId,
                response,
                0,
                'python',
                0,
                suggestionState
            )
            assertTelemetry({
                codewhispererRequestId: 'test_x',
                codewhispererSessionId: 'test_x',
                codewhispererPaginationProgress: 0,
                codewhispererTriggerType: 'AutoTrigger',
                codewhispererSuggestionIndex: 0,
                codewhispererSuggestionState: 'Discard',
                codewhispererSuggestionReferenceCount: 0,
                codewhispererCompletionType: 'Line',
                codewhispererLanguage: 'python',
            })
        })
    })
})
