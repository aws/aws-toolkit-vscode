/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import globals from '../../../../shared/extensionGlobals'
import { assertTelemetryCurried } from '../../../testUtil'
import { ConsolasTracker } from '../../../../vector/consolas/tracker/consolasTracker'
import { resetConsolasGlobalVariables, createAcceptedSuggestionEntry } from '../testUtil'

describe('consolasTracker', function () {
    describe('enqueue', function () {
        beforeEach(function () {
            resetConsolasGlobalVariables()
            ConsolasTracker.getTracker().shutdown()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should put suggestion in queue', function () {
            const suggestion = createAcceptedSuggestionEntry()
            const pushSpy = sinon.spy(Array.prototype, 'push')
            ConsolasTracker.getTracker().enqueue(suggestion)
            assert.ok(!pushSpy.neverCalledWith(suggestion))
        })

        it('Should not enque when telemetry is disabled', function () {
            globals.telemetry.telemetryEnabled = false
            const suggestion = createAcceptedSuggestionEntry()
            const pushSpy = sinon.spy(Array.prototype, 'push')
            ConsolasTracker.getTracker().enqueue(suggestion)
            assert.ok(pushSpy.neverCalledWith(suggestion))
            globals.telemetry.telemetryEnabled = true
        })
    })

    describe('flush', function () {
        beforeEach(function () {
            resetConsolasGlobalVariables()
            ConsolasTracker.getTracker().shutdown()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should call emit telemetry for event existed longer than 5 min, put back to queue if less than 5 min', async function () {
            const suggestion1 = createAcceptedSuggestionEntry(new Date())
            const suggestion2 = createAcceptedSuggestionEntry(new Date(Date.now() - 6 * 60 * 1000))
            const emitSpy = sinon.spy(ConsolasTracker.prototype, 'emitTelemetryOnSuggestion')
            ConsolasTracker.getTracker().enqueue(suggestion1)
            ConsolasTracker.getTracker().enqueue(suggestion2)
            await ConsolasTracker.getTracker().flush()
            assert.ok(emitSpy.calledOnce)
            assert.ok(!emitSpy.neverCalledWith(suggestion2))
            assert.ok(emitSpy.neverCalledWith(suggestion1))
        })

        it('Should skip if telemetry is disabled', async function () {
            const getTimeSpy = sinon.spy(Date.prototype, 'getTime')
            await ConsolasTracker.getTracker().flush()
            assert.ok(!getTimeSpy.called)
        })
    })

    describe('checkDiff', function () {
        it('Should return 1.0 distance for invalid input strings', function () {
            assert.strictEqual(ConsolasTracker.getTracker().checkDiff('', 'aabcd'), 1.0)
            assert.strictEqual(ConsolasTracker.getTracker().checkDiff('abbbacd', ''), 1.0)
        })

        it('Should return 1/levenshtein distance for valid input strings', function () {
            assert.strictEqual(ConsolasTracker.getTracker().checkDiff('abccd', 'aabcd'), 0.4)
        })
    })

    describe('emitTelemetryOnSuggestion', function () {
        it('Should call recordConsolasUserModification with suggestion event', async function () {
            const suggestion = createAcceptedSuggestionEntry()
            const assertTelemetry = assertTelemetryCurried('consolas_userModification')
            await ConsolasTracker.getTracker().emitTelemetryOnSuggestion(suggestion)
            assertTelemetry({
                consolasRequestId: 'test',
                consolasTriggerType: 'OnDemand',
                consolasSuggestionIndex: 1,
                consolasModificationPercentage: 1,
                consolasCompletionType: 'Line',
                consolasLanguage: 'java',
                consolasRuntime: 'java11',
                consolasRuntimeSource: '11.0.13',
            })
        })
    })
})
