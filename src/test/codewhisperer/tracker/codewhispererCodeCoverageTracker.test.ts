/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { CodeWhispererCodeCoverageTracker } from '../../../codewhisperer/tracker/codewhispererCodeCoverageTracker'
import { createMockDocument, createMockTextEditor, resetCodeWhispererGlobalVariables } from '../testUtil'
import globals from '../../../shared/extensionGlobals'
import { assertTelemetryCurried } from '../../testUtil'
import { vsCodeState } from '../../../codewhisperer/models/model'
import { FakeMemento } from '../../fakeExtensionContext'
import { TelemetryHelper } from '../../../codewhisperer/util/telemetryHelper'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { CodeWhispererUserGroupSettings } from '../../../codewhisperer/util/userGroupUtil'
import { extensionVersion } from '../../../shared/vscode/env'

describe('codewhispererCodecoverageTracker', function () {
    const language = 'python'

    describe('test getTracker', function () {
        afterEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.clear()
        })

        it('unsupported language', function () {
            assert.strictEqual(CodeWhispererCodeCoverageTracker.getTracker('vb'), undefined)
            assert.strictEqual(CodeWhispererCodeCoverageTracker.getTracker('r'), undefined)
            assert.strictEqual(CodeWhispererCodeCoverageTracker.getTracker('ipynb'), undefined)
        })

        it('supported language', function () {
            assert.notStrictEqual(CodeWhispererCodeCoverageTracker.getTracker('python'), undefined)
            assert.notStrictEqual(CodeWhispererCodeCoverageTracker.getTracker('javascriptreact'), undefined)
            assert.notStrictEqual(CodeWhispererCodeCoverageTracker.getTracker('java'), undefined)
            assert.notStrictEqual(CodeWhispererCodeCoverageTracker.getTracker('javascript'), undefined)
            assert.notStrictEqual(CodeWhispererCodeCoverageTracker.getTracker('cpp'), undefined)
            assert.notStrictEqual(CodeWhispererCodeCoverageTracker.getTracker('ruby'), undefined)
            assert.notStrictEqual(CodeWhispererCodeCoverageTracker.getTracker('go'), undefined)
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

            instance1 = CodeWhispererCodeCoverageTracker.getTracker('javascriptreact')
            instance2 = CodeWhispererCodeCoverageTracker.getTracker('javascriptreact')
            assert.notStrictEqual(instance1, undefined)
            assert.strictEqual(Object.is(instance1, instance2), true)
        })
    })

    describe('test isActive', function () {
        const fakeMemeto = new FakeMemento()
        let tracker: CodeWhispererCodeCoverageTracker | undefined

        afterEach(function () {
            resetCodeWhispererGlobalVariables()
            CodeWhispererCodeCoverageTracker.instances.clear()
            sinon.restore()
        })

        it('inactive case: telemetryEnable = true, isConnected = false', function () {
            sinon.stub(TelemetryHelper.instance, 'isTelemetryEnabled').returns(true)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(false)

            tracker = CodeWhispererCodeCoverageTracker.getTracker('python', fakeMemeto)
            if (!tracker) {
                assert.fail()
            }

            assert.strictEqual(tracker.isActive(), false)
        })

        it('inactive case: telemetryEnabled = false, isConnected = false', function () {
            sinon.stub(TelemetryHelper.instance, 'isTelemetryEnabled').returns(false)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(false)

            tracker = CodeWhispererCodeCoverageTracker.getTracker('java', fakeMemeto)
            if (!tracker) {
                assert.fail()
            }

            assert.strictEqual(tracker.isActive(), false)
        })

        it('active case: telemetryEnabled = true, isConnected = true', function () {
            sinon.stub(TelemetryHelper.instance, 'isTelemetryEnabled').returns(true)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(true)

            tracker = CodeWhispererCodeCoverageTracker.getTracker('javascript', fakeMemeto)
            if (!tracker) {
                assert.fail()
            }
            assert.strictEqual(tracker.isActive(), true)
        })
    })

    describe('updateAcceptedTokensCount', function () {
        let tracker: CodeWhispererCodeCoverageTracker | undefined

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            if (tracker) {
                sinon.stub(tracker, 'isActive').returns(true)
            }
        })

        afterEach(function () {
            sinon.restore()
            CodeWhispererCodeCoverageTracker.instances.clear()
        })

        it('Should compute edit distance to update the accepted tokens', function () {
            if (!tracker) {
                assert.fail()
            }
            const editor = createMockTextEditor('def addTwoNumbers(a, b):\n')

            tracker.addAcceptedTokens(editor.document.fileName, {
                range: new vscode.Range(0, 0, 0, 25),
                text: `def addTwoNumbers(x, y):\n`,
                accepted: 25,
            })
            tracker.addTotalTokens(editor.document.fileName, 100)
            tracker.updateAcceptedTokensCount(editor)
            assert.strictEqual(tracker?.acceptedTokens[editor.document.fileName][0].accepted, 23)
        })
    })

    describe('getUnmodifiedAcceptedTokens', function () {
        let tracker: CodeWhispererCodeCoverageTracker | undefined

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            if (tracker) {
                sinon.stub(tracker, 'isActive').returns(true)
            }
        })

        afterEach(function () {
            sinon.restore()
            CodeWhispererCodeCoverageTracker.instances.clear()
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
        let tracker: CodeWhispererCodeCoverageTracker | undefined

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            if (tracker) {
                sinon.stub(tracker, 'isActive').returns(true)
            }
        })

        afterEach(function () {
            sinon.restore()
            CodeWhispererCodeCoverageTracker.instances.clear()
        })

        it('Should skip when tracker is not active', function () {
            if (!tracker) {
                assert.fail()
            }
            tracker.countAcceptedTokens(new vscode.Range(0, 0, 0, 1), 'a', 'test.py')
            const spy = sinon.spy(CodeWhispererCodeCoverageTracker.prototype, 'addAcceptedTokens')
            assert.ok(!spy.called)
        })

        it('Should increase both AcceptedTokens and TotalTokens', function () {
            if (!tracker) {
                assert.fail()
            }
            tracker.countAcceptedTokens(new vscode.Range(0, 0, 0, 1), 'a', 'test.py')
            assert.deepStrictEqual(tracker.acceptedTokens['test.py'][0], {
                range: new vscode.Range(0, 0, 0, 1),
                text: 'a',
                accepted: 1,
            })
            assert.strictEqual(tracker.totalTokens['test.py'], 1)
        })
    })

    describe('countTotalTokens', function () {
        let tracker: CodeWhispererCodeCoverageTracker | undefined

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            if (tracker) {
                sinon.stub(tracker, 'isActive').returns(true)
            }
        })

        afterEach(function () {
            sinon.restore()
            CodeWhispererCodeCoverageTracker.instances.clear()
        })

        it('Should skip when user copy large files', function () {
            if (!tracker) {
                assert.fail()
            }
            tracker.countTotalTokens({
                reason: undefined,
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
            if (!tracker) {
                assert.fail()
            }
            vsCodeState.isCodeWhispererEditing = true
            tracker.countTotalTokens({
                reason: undefined,
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
            if (!tracker) {
                assert.fail()
            }
            const doc = createMockDocument('import math', 'test.py', 'python')
            tracker.countTotalTokens({
                reason: undefined,
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
            tracker.countTotalTokens({
                reason: undefined,
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
            if (!tracker) {
                assert.fail()
            }
            const doc = createMockDocument('import math', 'test.py', 'python')
            tracker.countTotalTokens({
                reason: undefined,
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
        let tracker: CodeWhispererCodeCoverageTracker | undefined

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            if (tracker) {
                sinon.stub(tracker, 'isActive').returns(true)
            }
        })

        afterEach(function () {
            sinon.restore()
            CodeWhispererCodeCoverageTracker.instances.clear()
        })

        it('Should not send codecoverage telemetry if tracker is not active', function () {
            if (!tracker) {
                assert.fail()
            }
            sinon.restore()
            sinon.stub(tracker, 'isActive').returns(false)

            tracker.addAcceptedTokens(`test.py`, { range: new vscode.Range(0, 0, 0, 7), text: `print()`, accepted: 7 })
            tracker.addTotalTokens(`test.py`, 100)
            tracker.flush()
            const data = globals.telemetry.logger.query({
                metricName: 'codewhisperer_codePercentage',
                excludeKeys: ['awsAccount'],
            })
            assert.strictEqual(data.length, 0)
        })
    })

    describe('emitCodeWhispererCodeContribution', function () {
        let tracker: CodeWhispererCodeCoverageTracker | undefined

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            tracker = CodeWhispererCodeCoverageTracker.getTracker(language)
            if (tracker) {
                sinon.stub(tracker, 'isActive').returns(true)
            }
        })

        afterEach(function () {
            sinon.restore()
            CodeWhispererCodeCoverageTracker.instances.clear()
            CodeWhispererUserGroupSettings.instance.reset()
        })

        it('should emit correct code coverage telemetry in python file', async function () {
            await globals.context.globalState.update(CodeWhispererConstants.userGroupKey, {
                group: CodeWhispererConstants.UserGroup.Control,
                version: extensionVersion,
            })

            const tracker = CodeWhispererCodeCoverageTracker.getTracker(language)

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
                codewhispererUserGroup: 'Control',
            })
        })

        it('should emit correct code coverage telemetry in java file', async function () {
            await globals.context.globalState.update(CodeWhispererConstants.userGroupKey, {
                group: CodeWhispererConstants.UserGroup.Control,
                version: extensionVersion,
            })

            const tracker = CodeWhispererCodeCoverageTracker.getTracker('java')

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
                codewhispererUserGroup: 'Control',
            })
        })
    })
})
