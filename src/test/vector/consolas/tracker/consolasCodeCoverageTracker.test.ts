/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { ConsolasCodeCoverageTracker } from '../../../../vector/consolas/tracker/consolasCodeCoverageTracker'
import { resetConsolasGlobalVariables } from '../testUtil'
import globals from '../../../../shared/extensionGlobals'
import { assertTelemetryCurried } from '../../../testUtil'

describe('consolasCodecoverageTracker', function () {
    const language = 'plaintext'
    const mockGlobalStorage: vscode.Memento = {
        update: sinon.spy(),
        get: sinon.stub().returns(true),
    }

    describe('setAcceptedTokens', function () {
        beforeEach(function () {
            resetConsolasGlobalVariables()
            ConsolasCodeCoverageTracker.instances.delete(language)
        })

        it('Should set Accepted Tokens when consolas terms accepted', function () {
            const suggestion = "print('Hello World!')"
            const tracker = ConsolasCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            tracker.setAcceptedTokens(suggestion)
            assert.strictEqual(tracker.AcceptedTokensLength, 21)
        })
    })

    describe('flush', function () {
        const mockGlobalStorage1: vscode.Memento = {
            update: sinon.spy(),
            get: sinon.stub().returns(false),
        }
        beforeEach(function () {
            resetConsolasGlobalVariables()
            ConsolasCodeCoverageTracker.instances.delete(language)
        })

        it('Should not send codecoverage telemetry if consolas is disabled', function () {
            const suggestion1 = "print('Hello World!)"
            const suggestion2 = "print('Hello World!)"
            const tracker = ConsolasCodeCoverageTracker.getTracker(language, mockGlobalStorage1)
            tracker.setTotalTokens(suggestion1)
            tracker.setAcceptedTokens(suggestion2)
            tracker.flush()
            const data = globals.telemetry.logger.query({
                metricName: 'consolas_codePercentage',
                filters: ['awsAccount'],
            })
            assert.strictEqual(data.length, 0)
        })
    })

    describe('emitConsolasCodeContribution', function () {
        beforeEach(function () {
            resetConsolasGlobalVariables()
            ConsolasCodeCoverageTracker.instances.delete(language)
        })

        it(' emits codecoverage telemetry ', function () {
            const sample = "print('Hello World!)"
            const tracker = ConsolasCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            const assertTelemetry = assertTelemetryCurried('consolas_codePercentage')
            tracker.setTotalTokens(sample)
            tracker.setAcceptedTokens(sample)
            tracker.emitConsolasCodeContribution()
            const date = new globals.clock.Date(new globals.clock.Date().getTime())
            assertTelemetry({
                consolasTotalTokens: 20,
                consolasStartTime: date.toString(),
                consolasLanguage: language,
                consolasAcceptedTokens: 20,
                consolasPercentage: 100,
            })
        })
    })
})
