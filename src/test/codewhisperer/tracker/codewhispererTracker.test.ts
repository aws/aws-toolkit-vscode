/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import globals from '../../../shared/extensionGlobals'
import { assertTelemetryCurried } from '../../testUtil'
import { CodeWhispererTracker } from '../../../codewhisperer/tracker/codewhispererTracker'
import { resetCodeWhispererGlobalVariables, createAcceptedSuggestionEntry } from '../testUtil'
import { TelemetryHelper } from '../../../codewhisperer/util/telemetryHelper'

describe('codewhispererTracker', function () {
    describe('enqueue', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererTracker.getTracker().shutdown()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should put suggestion in queue', function () {
            const suggestion = createAcceptedSuggestionEntry()
            const pushSpy = sinon.spy(Array.prototype, 'push')
            CodeWhispererTracker.getTracker().enqueue(suggestion)
            assert.ok(!pushSpy.neverCalledWith(suggestion))
        })

        it('Should not enque when telemetry is disabled', function () {
            globals.telemetry.telemetryEnabled = false
            const suggestion = createAcceptedSuggestionEntry()
            const pushSpy = sinon.spy(Array.prototype, 'push')
            CodeWhispererTracker.getTracker().enqueue(suggestion)
            assert.ok(pushSpy.neverCalledWith(suggestion))
            globals.telemetry.telemetryEnabled = true
        })
    })

    describe('flush', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererTracker.getTracker().shutdown()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should call emit telemetry for event existed longer than 5 min, put back to queue if less than 5 min', async function () {
            const suggestion1 = createAcceptedSuggestionEntry(new Date())
            const suggestion2 = createAcceptedSuggestionEntry(new Date(Date.now() - 6 * 60 * 1000))
            const emitSpy = sinon.spy(CodeWhispererTracker.prototype, 'emitTelemetryOnSuggestion')
            CodeWhispererTracker.getTracker().enqueue(suggestion1)
            CodeWhispererTracker.getTracker().enqueue(suggestion2)
            await CodeWhispererTracker.getTracker().flush()
            assert.ok(emitSpy.calledOnce)
            assert.ok(!emitSpy.neverCalledWith(suggestion2))
            assert.ok(emitSpy.neverCalledWith(suggestion1))
        })

        it('Should skip if telemetry is disabled', async function () {
            const getTimeSpy = sinon.spy(Date.prototype, 'getTime')
            await CodeWhispererTracker.getTracker().flush()
            assert.ok(!getTimeSpy.called)
        })
    })

    describe('checkDiff', function () {
        it('Should return 1.0 distance for invalid input strings', function () {
            assert.strictEqual(CodeWhispererTracker.getTracker().checkDiff('', 'aabcd'), 1.0)
            assert.strictEqual(CodeWhispererTracker.getTracker().checkDiff('abbbacd', ''), 1.0)
        })

        it('Should return 1/levenshtein distance for valid input strings', function () {
            assert.strictEqual(CodeWhispererTracker.getTracker().checkDiff('abccd', 'aabcd'), 0.4)
        })
    })

    describe('emitTelemetryOnSuggestion', function () {
        it('Should call recordCodewhispererUserModification with suggestion event', async function () {
            const testStartUrl = 'testStartUrl'
            sinon.stub(TelemetryHelper.instance, 'startUrl').value(testStartUrl)
            const suggestion = createAcceptedSuggestionEntry()
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userModification')
            await CodeWhispererTracker.getTracker().emitTelemetryOnSuggestion(suggestion)
            assertTelemetry({
                codewhispererRequestId: 'test',
                codewhispererSessionId: 'test',
                codewhispererTriggerType: 'OnDemand',
                codewhispererSuggestionIndex: 1,
                codewhispererModificationPercentage: 1,
                codewhispererCompletionType: 'Line',
                codewhispererLanguage: 'java',
                credentialStartUrl: testStartUrl,
            })
        })
    })
})
