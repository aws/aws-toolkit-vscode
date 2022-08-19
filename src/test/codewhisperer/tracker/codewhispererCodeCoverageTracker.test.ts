/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { CodeWhispererCodeCoverageTracker } from '../../../codewhisperer/tracker/codewhispererCodeCoverageTracker'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import globals from '../../../shared/extensionGlobals'
import { assertTelemetryCurried } from '../../testUtil'

describe('codewhispererCodecoverageTracker', function () {
    const language = 'plaintext'
    const mockGlobalStorage: vscode.Memento = {
        update: sinon.spy(),
        get: sinon.stub().returns(true),
    }

    describe('setAcceptedTokens', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        it('Should set Accepted Tokens when CodeWhisperer terms accepted', function () {
            const suggestion = "print('Hello World!')"
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage)
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
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        it('Should not send codecoverage telemetry if CodeWhisperer is disabled', function () {
            const suggestion1 = "print('Hello World!)"
            const suggestion2 = "print('Hello World!)"
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage1)
            tracker.setTotalTokens(suggestion1)
            tracker.setAcceptedTokens(suggestion2)
            tracker.flush()
            const data = globals.telemetry.logger.query({
                metricName: 'codewhisperer_codePercentage',
                filters: ['awsAccount'],
            })
            assert.strictEqual(data.length, 0)
        })
    })

    describe('emitCodeWhispererCodeContribution', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        it(' emits codecoverage telemetry ', function () {
            const sample = "print('Hello World!)"
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            const assertTelemetry = assertTelemetryCurried('codewhisperer_codePercentage')
            tracker.setAcceptedTokens(sample)
            tracker.emitCodeWhispererCodeContribution()
            assertTelemetry({
                codewhispererTotalTokens: 20,
                codewhispererLanguage: language,
                codewhispererAcceptedTokens: 20,
                codewhispererPercentage: 100,
            })
        })
    })
})
