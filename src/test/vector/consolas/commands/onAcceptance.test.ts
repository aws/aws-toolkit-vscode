/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { onAcceptance } from '../../../../vector/consolas/commands/onAcceptance'
import { resetConsolasGlobalVariables, createMockTextEditor } from '../testUtil'
import { ConsolasTracker } from '../../../../vector/consolas/tracker/consolasTracker'
import { assertTelemetryCurried } from '../../../testUtil'
import { FakeExtensionContext } from '../../../fakeExtensionContext'
import { TelemetryHelper } from '../../../../vector/consolas/util/telemetryHelper'
import { RecommendationHandler } from '../../../../vector/consolas/service/recommendationHandler'

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
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 21)),
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    sessionId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                    references: undefined,
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
            const fakeReferences = [
                {
                    message: '',
                    licenseName: 'MIT',
                    repository: 'http://github.com/fake',
                    contentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ]
            await onAcceptance(
                {
                    editor: mockEditor,
                    range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 27)),
                    acceptIndex: 0,
                    recommendation: "console.log('Hello World!')",
                    requestId: '',
                    sessionId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'javascript',
                    references: fakeReferences,
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
            const fakeReferences = [
                {
                    message: '',
                    licenseName: 'MIT',
                    repository: 'http://github.com/fake',
                    contentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ]
            await onAcceptance(
                {
                    editor: mockEditor,
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 26)),
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    sessionId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                    references: fakeReferences,
                },
                true,
                extensionContext.globalState
            )
            const actualArg = trackerSpy.getCall(0).args[0]
            assert.ok(trackerSpy.calledOnce)
            assert.strictEqual(actualArg.originalString, 'def two_sum(nums, target):')
            assert.strictEqual(actualArg.requestId, '')
            assert.strictEqual(actualArg.sessionId, '')
            assert.strictEqual(actualArg.triggerType, 'OnDemand')
            assert.strictEqual(actualArg.completionType, 'Line')
            assert.strictEqual(actualArg.language, 'python')
            assert.deepStrictEqual(actualArg.startPosition, new vscode.Position(1, 0))
            assert.deepStrictEqual(actualArg.endPosition, new vscode.Position(1, 26))
            assert.strictEqual(actualArg.index, 0)
        })

        it('Should report telemetry that records this user decision event', async function () {
            const mockEditor = createMockTextEditor()
            RecommendationHandler.instance.requestId = 'test'
            RecommendationHandler.instance.sessionId = 'test'
            RecommendationHandler.instance.startPos = new vscode.Position(1, 0)
            mockEditor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0))
            RecommendationHandler.instance.recommendations = [{ content: "print('Hello World!')" }]
            RecommendationHandler.instance.recommendationSuggestionState = new Map([[0, 'Showed']])
            TelemetryHelper.instance.triggerType = 'OnDemand'
            TelemetryHelper.instance.completionType = 'Line'
            const assertTelemetry = assertTelemetryCurried('consolas_userDecision')
            const extensionContext = await FakeExtensionContext.create()
            await onAcceptance(
                {
                    editor: mockEditor,
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 21)),
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    sessionId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                    references: undefined,
                },
                true,
                extensionContext.globalState
            )
            assertTelemetry({
                consolasRequestId: 'test',
                consolasSessionId: 'test',
                consolasPaginationProgress: 1,
                consolasTriggerType: 'OnDemand',
                consolasSuggestionIndex: 0,
                consolasSuggestionState: 'Accept',
                consolasSuggestionReferenceCount: 0,
                consolasCompletionType: 'Line',
                consolasLanguage: 'python',
                consolasRuntime: 'python2',
                consolasRuntimeSource: '2.7.16',
            })
        })
    })
})
