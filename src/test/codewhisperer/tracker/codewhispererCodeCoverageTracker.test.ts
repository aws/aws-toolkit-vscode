/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { CodeWhispererCodeCoverageTracker } from '../../../codewhisperer/tracker/codewhispererCodeCoverageTracker'
import { createMockDocument, createMockTextEditor, resetCodeWhispererGlobalVariables } from '../testUtil'
import globals from '../../../shared/extensionGlobals'
import { assertTelemetryCurried } from '../../testUtil'
import { vsCodeState } from '../../../codewhisperer/models/model'

describe('codewhispererCodecoverageTracker', function () {
    const language = 'python'
    const mockGlobalStorage: vscode.Memento = {
        update: sinon.spy(),
        get: sinon.stub().returns(true),
    }

    describe('updateAcceptedTokensCount', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        it('Should compute edit distance to update the accepted tokens', function () {
            const editor = createMockTextEditor('import math\ndef addTwoNumbers(a, b):\n')
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            tracker?.addAcceptedTokens(editor.document.fileName, {
                range: new vscode.Range(0, 0, 0, 39),
                text: `import math\ndef two_sum(nums, target):\n`,
                accepted: 39,
            })
            tracker?.addTotalTokens(editor.document.fileName, 100)
            tracker?.updateAcceptedTokensCount(editor)
            assert.strictEqual(tracker?.acceptedTokens[editor.document.fileName][0].accepted, 12)
        })
        afterEach(function () {
            sinon.restore()
        })
    })

    describe('countAcceptedTokens', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })
        afterEach(function () {
            sinon.restore()
        })
        it('Should skip when codeWhisperer ToS is not accepted', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, {
                update: sinon.spy(),
                get: sinon.stub().returns(false),
            })
            tracker?.countAcceptedTokens(new vscode.Range(0, 0, 0, 1), 'a', 'test.py')
            const spy = sinon.spy(CodeWhispererCodeCoverageTracker.prototype, 'addAcceptedTokens')
            assert.ok(!spy.called)
        })

        it('Should increase both AcceptedTokens and TotalTokens', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            if (tracker) {
                tracker.countAcceptedTokens(new vscode.Range(0, 0, 0, 1), 'a', 'test.py')
                assert.deepStrictEqual(tracker.acceptedTokens['test.py'][0], {
                    range: new vscode.Range(0, 0, 0, 1),
                    text: 'a',
                    accepted: 1,
                })
                assert.strictEqual(tracker.totalTokens['test.py'], 1)
            }
        })
    })

    describe('countTotalTokens', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })
        afterEach(function () {
            sinon.restore()
        })
        it('Should skip when user copy large files', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            tracker?.countTotalTokens({
                document: createMockDocument(),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 30),
                        rangeOffset: 0,
                        rangeLength: 30,
                        text: 'def twoSum(nums, target):\nfor',
                    },
                ],
            })
            const startedSpy = sinon.spy(CodeWhispererCodeCoverageTracker.prototype, 'addTotalTokens')
            assert.ok(!startedSpy.called)
        })

        it('Should skip when CodeWhisperer is editing', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            vsCodeState.isCodeWhispererEditing = true
            tracker?.countTotalTokens({
                document: createMockDocument(),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 30),
                        rangeOffset: 0,
                        rangeLength: 30,
                        text: 'def twoSum(nums, target):\nfor',
                    },
                ],
            })
            const startedSpy = sinon.spy(CodeWhispererCodeCoverageTracker.prototype, 'addTotalTokens')
            assert.ok(!startedSpy.called)
        })

        it('Should reduce tokens when delete', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            tracker?.countTotalTokens({
                document: createMockDocument(),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 3),
                        rangeOffset: 0,
                        rangeLength: 0,
                        text: 'aaa',
                    },
                ],
            })
            tracker?.countTotalTokens({
                document: createMockDocument(),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 1),
                        rangeOffset: 1,
                        rangeLength: 1,
                        text: '',
                    },
                ],
            })
            assert.strictEqual(tracker?.totalTokens['/test.py'], 2)
        })

        it('Should add tokens when type', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            tracker?.countTotalTokens({
                document: createMockDocument(),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 1),
                        rangeOffset: 0,
                        rangeLength: 0,
                        text: 'a',
                    },
                ],
            })
            assert.strictEqual(tracker?.totalTokens['/test.py'], 1)
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
        afterEach(function () {
            sinon.restore()
        })
        it('Should not send codecoverage telemetry if CodeWhisperer is disabled', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage1)
            tracker?.addAcceptedTokens(`test.py`, { range: new vscode.Range(0, 0, 0, 7), text: `print()`, accepted: 7 })
            tracker?.addTotalTokens(`test.py`, 100)
            tracker?.flush()
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
        afterEach(function () {
            sinon.restore()
        })
        it(' emits codecoverage telemetry ', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language, mockGlobalStorage)
            const assertTelemetry = assertTelemetryCurried('codewhisperer_codePercentage')
            tracker?.addAcceptedTokens(`test.py`, { range: new vscode.Range(0, 0, 0, 7), text: `print()`, accepted: 7 })
            tracker?.addTotalTokens(`test.py`, 100)
            tracker?.emitCodeWhispererCodeContribution()
            assertTelemetry({
                codewhispererTotalTokens: 100,
                codewhispererLanguage: language,
                codewhispererAcceptedTokens: 7,
                codewhispererPercentage: 7,
            })
        })
    })
})
