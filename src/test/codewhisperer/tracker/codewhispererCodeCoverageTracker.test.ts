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
import { FakeMemento } from '../../fakeExtensionContext'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'

describe('codewhispererCodecoverageTracker', function () {
    const language = 'python'

    describe('test getTracker', function () {
        afterEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.clear()
        })

        it('unsupported language', function () {
            assert.strictEqual(CodeWhispererCodeCoverageTracker.getTracker('cpp'), undefined)
            assert.strictEqual(CodeWhispererCodeCoverageTracker.getTracker('ruby'), undefined)
            assert.strictEqual(CodeWhispererCodeCoverageTracker.getTracker('go'), undefined)
        })

        it('supported language and should return singleton object per language', function () {
            let instance1: CodeWhispererCodeCoverageTracker | undefined
            let instance2: CodeWhispererCodeCoverageTracker | undefined
            instance1 = CodeWhispererCodeCoverageTracker.getTracker('java')
            instance2 = CodeWhispererCodeCoverageTracker.getTracker('java')
            assert.notStrictEqual(instance1, undefined)
            assert.strictEqual(Object.is(instance1, instance2), true)

            instance1 = CodeWhispererCodeCoverageTracker.getTracker('python')
            instance2 = CodeWhispererCodeCoverageTracker.getTracker('python')
            assert.notStrictEqual(instance1, undefined)
            assert.strictEqual(Object.is(instance1, instance2), true)

            instance1 = CodeWhispererCodeCoverageTracker.getTracker('jsx')
            instance2 = CodeWhispererCodeCoverageTracker.getTracker('jsx')
            assert.notStrictEqual(instance1, undefined)
            assert.strictEqual(Object.is(instance1, instance2), true)
        })
    })

    describe('test activeTrackerIfNotActive', function () {
        const fakeMemeto = new FakeMemento()

        afterEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.clear()
        })

        it('default is not active', function () {
            const javaTracker = CodeWhispererCodeCoverageTracker.getTracker('java')
            const jsTracker = CodeWhispererCodeCoverageTracker.getTracker('javascript')
            assert.strictEqual(javaTracker?.isTrackerActive, false)
            assert.strictEqual(jsTracker?.isTrackerActive, false)
        })

        it('should be activated when cwspr terms are accepted', function () {
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, true)

            const javaTracker = CodeWhispererCodeCoverageTracker.getTracker('java')
            assert.strictEqual(javaTracker?.isTrackerActive, false)

            javaTracker.activateTrackerIfNotActive(fakeMemeto)
            assert.strictEqual(javaTracker?.isTrackerActive, true)
        })

        it('should not be activated when cwspr terms are not accepted', function () {
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, false)
            const javaTracker = CodeWhispererCodeCoverageTracker.getTracker('java')
            assert.strictEqual(javaTracker?.isTrackerActive, false)

            javaTracker.activateTrackerIfNotActive(fakeMemeto)
            assert.strictEqual(javaTracker?.isTrackerActive, false)
        })
    })

    describe('updateAcceptedTokensCount', function () {
        const fakeMemeto = new FakeMemento()

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, true)
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        afterEach(function () {
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, false)
            sinon.restore()
        })

        it('Should compute edit distance to update the accepted tokens', function () {
            const editor = createMockTextEditor('def addTwoNumbers(a, b):\n')
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            assert.strictEqual(tracker?.isTrackerActive, false)
            tracker?.activateTrackerIfNotActive(fakeMemeto)
            tracker?.addAcceptedTokens(editor.document.fileName, {
                range: new vscode.Range(0, 0, 0, 25),
                text: `def addTwoNumbers(x, y):\n`,
                accepted: 25,
            })
            tracker?.addTotalTokens(editor.document.fileName, 100)
            tracker?.updateAcceptedTokensCount(editor)
            assert.strictEqual(tracker?.acceptedTokens[editor.document.fileName][0].accepted, 23)
        })
    })

    describe('getUnmodifiedAcceptedTokens', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should return correct unmodified accepted tokens count', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            assert.strictEqual(tracker?.getUnmodifiedAcceptedTokens('foo', 'fou'), 2)
            assert.strictEqual(tracker?.getUnmodifiedAcceptedTokens('foo', 'f11111oo'), 3)
            assert.strictEqual(tracker?.getUnmodifiedAcceptedTokens('foo', 'fo'), 2)
            assert.strictEqual(tracker?.getUnmodifiedAcceptedTokens('helloworld', 'HelloWorld'), 8)
            assert.strictEqual(tracker?.getUnmodifiedAcceptedTokens('helloworld', 'World'), 4)
            assert.strictEqual(tracker?.getUnmodifiedAcceptedTokens('CodeWhisperer', 'CODE'), 1)
            assert.strictEqual(tracker?.getUnmodifiedAcceptedTokens('CodeWhisperer', 'CodeWhispererGood'), 13)
        })
    })

    describe('countAcceptedTokens', function () {
        const fakeMemeto = new FakeMemento()

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, true)
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        afterEach(function () {
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, false)
            sinon.restore()
        })

        it('Should skip when tracker is not active', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            assert.strictEqual(tracker?.isTrackerActive, false)
            tracker?.countAcceptedTokens(new vscode.Range(0, 0, 0, 1), 'a', 'test.py')
            const spy = sinon.spy(CodeWhispererCodeCoverageTracker.prototype, 'addAcceptedTokens')
            assert.ok(!spy.called)
        })

        it('Should increase both AcceptedTokens and TotalTokens', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            if (tracker) {
                tracker.activateTrackerIfNotActive(fakeMemeto)
                assert.strictEqual(tracker.isTrackerActive, true)
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
        const fakeMemeto = new FakeMemento()

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, true)
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        afterEach(function () {
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, false)
            sinon.restore()
        })

        it('Should skip when user copy large files', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            tracker?.activateTrackerIfNotActive(fakeMemeto)
            assert.strictEqual(tracker?.isTrackerActive, true)

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
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            tracker?.activateTrackerIfNotActive(fakeMemeto)
            assert.strictEqual(tracker?.isTrackerActive, true)
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
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            tracker?.activateTrackerIfNotActive(fakeMemeto)
            assert.strictEqual(tracker?.isTrackerActive, true)

            const doc = createMockDocument('import math', 'test.py', 'python')
            tracker?.countTotalTokens({
                document: doc,
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
                document: doc,
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 1),
                        rangeOffset: 1,
                        rangeLength: 1,
                        text: '',
                    },
                ],
            })
            assert.strictEqual(tracker?.totalTokens[doc.fileName], 2)
        })

        it('Should add tokens when type', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            tracker?.activateTrackerIfNotActive(fakeMemeto)
            assert.strictEqual(tracker?.isTrackerActive, true)

            const doc = createMockDocument('import math', 'test.py', 'python')
            tracker?.countTotalTokens({
                document: doc,
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 1),
                        rangeOffset: 0,
                        rangeLength: 0,
                        text: 'a',
                    },
                ],
            })
            assert.strictEqual(tracker?.totalTokens[doc.fileName], 1)
        })
    })

    describe('flush', function () {
        const fakeMemeto = new FakeMemento()

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, true)
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        afterEach(function () {
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, false)
            sinon.restore()
        })

        it('Should not send codecoverage telemetry if tracker is not active', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            assert.strictEqual(tracker?.isTrackerActive, false)

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
        const fakeMemeto = new FakeMemento()

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, true)
            CodeWhispererCodeCoverageTracker.instances.delete(language)
        })

        afterEach(function () {
            fakeMemeto.update(CodeWhispererConstants.termsAcceptedKey, false)
            sinon.restore()
        })

        it('should emit correct code coverage telemetry in python file', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            tracker?.activateTrackerIfNotActive(fakeMemeto)
            assert.strictEqual(tracker?.isTrackerActive, true)

            const assertTelemetry = assertTelemetryCurried('codewhisperer_codePercentage')
            tracker?.addAcceptedTokens(`test.py`, { range: new vscode.Range(0, 0, 0, 7), text: `print()`, accepted: 7 })
            tracker?.addTotalTokens(`test.py`, 100)
            tracker?.emitCodeWhispererCodeContribution()

            assertTelemetry({
                codewhispererTotalTokens: 100,
                codewhispererLanguage: language,
                codewhispererAcceptedTokens: 7,
                codewhispererPercentage: 7,
                successCount: 0,
            })
        })

        it('should emit correct code coverage telemetry in java file', function () {
            const tracker = CodeWhispererCodeCoverageTracker.getTracker('java')
            tracker?.activateTrackerIfNotActive(fakeMemeto)
            assert.strictEqual(tracker?.isTrackerActive, true)

            const assertTelemetry = assertTelemetryCurried('codewhisperer_codePercentage')
            tracker?.addAcceptedTokens(`test.java`, {
                range: new vscode.Range(0, 0, 0, 18),
                text: `public static main`,
                accepted: 18,
            })
            tracker?.addTotalTokens(`test.java`, 30)
            tracker?.emitCodeWhispererCodeContribution()
            assertTelemetry({
                codewhispererTotalTokens: 30,
                codewhispererLanguage: 'java',
                codewhispererAcceptedTokens: 18,
                codewhispererPercentage: 60,
                successCount: 0,
            })
        })
    })
})
