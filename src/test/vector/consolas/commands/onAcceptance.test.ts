/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { telemetryContext, recommendations, automatedTriggerContext } from '../../../../vector/consolas/models/model'
import {
    onAcceptance,
    hasExtraClosingBracket,
    handleAutoClosingBrackets,
} from '../../../../vector/consolas/commands/onAcceptance'
import { resetConsolasGlobalVariables, createMockTextEditor } from '../testUtil'
import { ConsolasTracker } from '../../../../vector/consolas/tracker/consolasTracker'
import { assertTelemetryCurried } from '../../../testUtil'
import { getLogger } from '../../../../shared/logger/logger'
import { FakeExtensionContext } from '../../../fakeExtensionContext'

describe('onAcceptance', function () {
    describe('onAcceptance', function () {
        beforeEach(function () {
            resetConsolasGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should format python code with command editor.action.format when current active document is python', async function () {
            const mockEditor = createMockTextEditor()
            const commandSpy = sinon.spy(vscode.commands, 'executeCommand')
            const extensionContext = await FakeExtensionContext.create()
            await onAcceptance(
                {
                    editor: mockEditor,
                    line: 1,
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                },
                true,
                extensionContext.globalState
            )
            assert.ok(commandSpy.calledWith('editor.action.format'))
        })

        it('Should format code selection with command vscode.executeFormatRangeProvider when current active document is not python', async function () {
            const mockEditor = createMockTextEditor("console.log('Hello')", 'test.js', 'javascript', 1, 0)
            const commandStub = sinon.stub(vscode.commands, 'executeCommand')
            const extensionContext = await FakeExtensionContext.create()
            await onAcceptance(
                {
                    editor: mockEditor,
                    line: 0,
                    acceptIndex: 0,
                    recommendation: "console.log('Hello World!')",
                    requestId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'javascript',
                },
                true,
                extensionContext.globalState
            )
            assert.ok(commandStub.calledWith('vscode.executeFormatRangeProvider'))
        })

        it('Should enqueue an event object to tracker', async function () {
            const mockEditor = createMockTextEditor()
            const trackerSpy = sinon.spy(ConsolasTracker.prototype, 'enqueue')
            const extensionContext = await FakeExtensionContext.create()
            await onAcceptance(
                {
                    editor: mockEditor,
                    line: 1,
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                },
                true,
                extensionContext.globalState
            )
            const actualArg = trackerSpy.getCall(0).args[0]
            assert.ok(trackerSpy.calledOnce)
            assert.strictEqual(actualArg.originalString, 'def two_sum(nums, target):')
            assert.strictEqual(actualArg.requestId, '')
            assert.strictEqual(actualArg.triggerType, 'OnDemand')
            assert.strictEqual(actualArg.completionType, 'Line')
            assert.strictEqual(actualArg.language, 'python')
            assert.deepStrictEqual(actualArg.startPosition, new vscode.Position(1, 0))
            assert.deepStrictEqual(actualArg.endPosition, new vscode.Position(1, 26))
            assert.strictEqual(actualArg.index, 0)
        })

        it('Should report telemetry that records this user decision event', async function () {
            const mockEditor = createMockTextEditor()
            recommendations.requestId = 'test'
            recommendations.response = [{ content: "print('Hello World!')" }]
            telemetryContext.triggerType = 'OnDemand'
            telemetryContext.completionType = 'Line'
            telemetryContext.isPrefixMatched = [true]
            const assertTelemetry = assertTelemetryCurried('consolas_userDecision')
            const extensionContext = await FakeExtensionContext.create()
            await onAcceptance(
                {
                    editor: mockEditor,
                    line: 1,
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                },
                true,
                extensionContext.globalState
            )
            assertTelemetry({
                consolasRequestId: 'test',
                consolasTriggerType: 'OnDemand',
                consolasSuggestionIndex: 0,
                consolasSuggestionState: 'Accept',
                consolasCompletionType: 'Line',
                consolasLanguage: 'python',
                consolasRuntime: 'python2',
                consolasRuntimeSource: '2.7.16',
            })
        })
    })

    describe('handleAutoClosingBrackets', function () {
        beforeEach(function () {
            resetConsolasGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should not edit current document if manual trigger', async function () {
            automatedTriggerContext.specialChar = '('
            const mockEditor = createMockTextEditor()
            const previousText = mockEditor.document.getText()
            await handleAutoClosingBrackets('OnDemand', mockEditor, '', 1)
            assert.strictEqual(previousText, mockEditor.document.getText())
        })

        it('Should not edit current document if special character in invocation context is not a open bracket', async function () {
            automatedTriggerContext.specialChar = '*'
            const mockEditor = createMockTextEditor()
            const previousText = mockEditor.document.getText()
            await handleAutoClosingBrackets('AutoTrigger', mockEditor, '', 1)
            assert.strictEqual(previousText, mockEditor.document.getText())
        })

        it('Should not remove a closing bracket if recommendation has same number of closing bracket and open bracket', async function () {
            automatedTriggerContext.specialChar = '('
            const mockEditor = createMockTextEditor()
            const previousText = mockEditor.document.getText()
            await handleAutoClosingBrackets('AutoTrigger', mockEditor, "print('Hello')", 1)
            assert.strictEqual(previousText, mockEditor.document.getText())
        })

        it('Should remove one closing bracket at current document if recommendation has 1 closing bracket and 0 open bracket', async function () {
            automatedTriggerContext.specialChar = '('
            const mockEditor = createMockTextEditor('import math\ndef four_sum(nums, target):\n')
            const loggerSpy = sinon.spy(getLogger(), 'info')
            await handleAutoClosingBrackets('AutoTrigger', mockEditor, 'var)', 1)
            assert.ok(loggerSpy.called)
            const actual = loggerSpy.getCall(0).args[0]
            assert.strictEqual(actual, `delete [{"line":1,"character":25},{"line":1,"character":26}]`)
        })

        it('Should remove one closing bracket at current document if recommendation has 2 closing bracket and 1 open bracket', async function () {
            automatedTriggerContext.specialChar = '('
            const mockEditor = createMockTextEditor('def two_sum(nums, target):\n')
            const loggerSpy = sinon.spy(getLogger(), 'info')
            await handleAutoClosingBrackets('AutoTrigger', mockEditor, "print('Hello'))", 1)
            assert.ok(loggerSpy.called)
            const actual = loggerSpy.getCall(0).args[0]
            assert.strictEqual(actual, `delete [{"line":0,"character":24},{"line":0,"character":25}]`)
        })
    })

    describe('hasExtraClosingBracket', function () {
        it('Should return true when a string has one more closing bracket than open bracket', function () {
            assert.ok(!hasExtraClosingBracket('split(str){}', '{', '}'))
            assert.ok(hasExtraClosingBracket('split(str){}}', '{', '}'))
            assert.ok(hasExtraClosingBracket('split(str){{}}}', '{', '}'))
            assert.ok(hasExtraClosingBracket('split(str)}', '{', '}'))
        })

        it('Should return result relevent to the open bracket in function argument when multiple brackets are present', function () {
            assert.ok(!hasExtraClosingBracket('split(str){}', '(', ')'))
            assert.ok(hasExtraClosingBracket('split(str)){}}', '(', ')'))
        })
    })
})
