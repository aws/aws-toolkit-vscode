/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { assertTelemetryCurried } from '../../../testUtil'
import { resetConsolasGlobalVariables } from '../testUtil'
import { TelemetryHelper } from '../../../../vector/consolas/util/telemetryHelper'
import { recommendations, telemetryContext } from '../../../../vector/consolas/models/model'

describe('telemetryHelper', function () {
    describe('recordSuggestionState', function () {
        beforeEach(function () {
            resetConsolasGlobalVariables()
        })

        it('user event is discard when recommendation 0 with accept index = -1 & recommendation prefix 0 does not match current code', function () {
            telemetryContext.isPrefixMatched = [false, true]
            const actual = TelemetryHelper.recordSuggestionState(telemetryContext.isPrefixMatched, 0, -1)
            assert.strictEqual(actual, 'Discard')
        })

        it('user event is reject when recommendation 0 with accept index = -1 & recommendation prefix 0 matches current code', function () {
            telemetryContext.isPrefixMatched = [true, true]
            const actual = TelemetryHelper.recordSuggestionState(telemetryContext.isPrefixMatched, 0, -1)
            assert.strictEqual(actual, 'Reject')
        })

        it('user event is discard when recommendation 1 with accept index = 1 & recommendation prefix 1 does not match code', function () {
            telemetryContext.isPrefixMatched = [true, false]
            const actual = TelemetryHelper.recordSuggestionState(telemetryContext.isPrefixMatched, 1, 1)
            assert.strictEqual(actual, 'Discard')
        })

        it('user event is Accept when recommendation 0 with accept index = 1 & recommendation prefix 0 matches code', function () {
            telemetryContext.isPrefixMatched = [true, true]
            const actual = TelemetryHelper.recordSuggestionState(telemetryContext.isPrefixMatched, 0, 0)
            assert.strictEqual(actual, 'Accept')
        })

        it('user event is Ignore when recommendation 0 with accept index = 1 & recommendation prefix 0 matches code', function () {
            telemetryContext.isPrefixMatched = [true, true]
            const actual = TelemetryHelper.recordSuggestionState(telemetryContext.isPrefixMatched, 0, 1)
            assert.strictEqual(actual, 'Ignore')
        })
    })

    describe('recordUserDecisionTelemetry', function () {
        it('Should call telemetry record for each recommendations with proper arguments', async function () {
            recommendations.response = [{ content: "print('Hello')" }]
            recommendations.requestId = 'test_x'
            telemetryContext.completionType = 'Line'
            telemetryContext.triggerType = 'AutoTrigger'
            const assertTelemetry = assertTelemetryCurried('consolas_userDecision')
            await TelemetryHelper.recordUserDecisionTelemetry(0, 'python')
            assert.strictEqual(recommendations.response.length, 0)
            assertTelemetry({
                consolasRequestId: 'test_x',
                consolasTriggerType: 'AutoTrigger',
                consolasSuggestionIndex: 0,
                consolasSuggestionState: 'Accept',
                consolasCompletionType: 'Line',
                consolasLanguage: 'python',
                consolasRuntime: 'python2',
                consolasRuntimeSource: '2.7.16',
            })
        })
    })
})
