/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { resetCodeWhispererGlobalVariables, createMockTextEditor } from 'aws-core-vscode/test'
import { assertTelemetryCurried } from 'aws-core-vscode/test'
import { FakeMemento } from 'aws-core-vscode/test'
import {
    onInlineAcceptance,
    RecommendationHandler,
    AuthUtil,
    session,
    CodeWhispererUserGroupSettings,
    userGroupKey,
    UserGroup,
} from 'aws-core-vscode/codewhisperer'
import { globals } from 'aws-core-vscode/shared'
import { extensionVersion } from 'aws-core-vscode/shared'

describe('onInlineAcceptance', function () {
    describe('onInlineAcceptance', function () {
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
            session.reset()
        })

        afterEach(function () {
            sinon.restore()
            session.reset()
            CodeWhispererUserGroupSettings.instance.reset()
        })

        it('Should dispose inline completion provider', async function () {
            const mockEditor = createMockTextEditor()
            const spy = sinon.spy(RecommendationHandler.instance, 'disposeInlineCompletion')
            const globalState = new FakeMemento()
            await onInlineAcceptance(
                {
                    editor: mockEditor,
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 21)),
                    effectiveRange: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 21)),
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
            await globals.context.globalState.update(userGroupKey, {
                group: UserGroup.Classifier,
                version: extensionVersion,
            })

            const testStartUrl = 'testStartUrl'
            sinon.stub(AuthUtil.instance, 'startUrl').value(testStartUrl)
            const mockEditor = createMockTextEditor()
            session.requestIdList = ['test']
            RecommendationHandler.instance.requestId = 'test'
            session.requestIdList = ['test']
            session.sessionId = 'test'
            session.startPos = new vscode.Position(1, 0)
            mockEditor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0))
            session.recommendations = [{ content: "print('Hello World!')" }]
            session.setSuggestionState(0, 'Showed')
            session.triggerType = 'OnDemand'
            session.setCompletionType(0, session.recommendations[0])
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userDecision')
            const globalState = new FakeMemento()
            await onInlineAcceptance(
                {
                    editor: mockEditor,
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 21)),
                    effectiveRange: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 21)),
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
