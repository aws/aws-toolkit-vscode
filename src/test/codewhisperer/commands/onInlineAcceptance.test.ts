/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { onInlineAcceptance } from '../../../codewhisperer/commands/onInlineAcceptance'
import { InlineCompletionService } from '../../../codewhisperer/service/inlineCompletionService'
import { resetCodeWhispererGlobalVariables, createMockTextEditor } from '../testUtil'
import { assertTelemetryCurried } from '../../testUtil'
import { FakeMemento } from '../../fakeExtensionContext'
import { TelemetryHelper } from '../../../codewhisperer/util/telemetryHelper'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import globals from '../../../shared/extensionGlobals'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { extensionVersion } from '../../../shared/vscode/env'
import { CodeWhispererUserGroupSettings } from '../../../codewhisperer/util/userGroupUtil'

describe('onInlineAcceptance', function () {
    describe('onInlineAcceptance', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
            CodeWhispererUserGroupSettings.instance.reset()
        })

        it('Should dispose inline completion provider', async function () {
            const mockEditor = createMockTextEditor()
            const spy = sinon.spy(InlineCompletionService.instance, 'disposeInlineCompletion')
            const globalState = new FakeMemento()
            await onInlineAcceptance(
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
                globalState
            )
            assert.ok(spy.calledWith())
        })

        it('Should report telemetry that records this user decision event', async function () {
            await globals.context.globalState.update(CodeWhispererConstants.userGroupKey, {
                group: CodeWhispererConstants.UserGroup.Classifier,
                version: extensionVersion,
            })

            const testStartUrl = 'testStartUrl'
            sinon.stub(TelemetryHelper.instance, 'startUrl').value(testStartUrl)
            const mockEditor = createMockTextEditor()
            RecommendationHandler.instance.requestId = 'test'
            RecommendationHandler.instance.sessionId = 'test'
            RecommendationHandler.instance.startPos = new vscode.Position(1, 0)
            mockEditor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0))
            RecommendationHandler.instance.recommendations = [{ content: "print('Hello World!')" }]
            RecommendationHandler.instance.setSuggestionState(0, 'Showed')
            TelemetryHelper.instance.triggerType = 'OnDemand'
            TelemetryHelper.instance.completionType = 'Line'
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userDecision')
            const globalState = new FakeMemento()
            await onInlineAcceptance(
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
                globalState
            )
            assertTelemetry({
                codewhispererRequestId: 'test',
                codewhispererSessionId: 'test',
                codewhispererPaginationProgress: 1,
                codewhispererTriggerType: 'OnDemand',
                codewhispererSuggestionIndex: 0,
                codewhispererSuggestionState: 'Accept',
                codewhispererSuggestionReferenceCount: 0,
                codewhispererCompletionType: 'Line',
                codewhispererLanguage: 'python',
                credentialStartUrl: testStartUrl,
                codewhispererUserGroup: 'Classifier',
            })
        })
    })
})
