/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import {
    onAcceptance,
    userGroupKey,
    UserGroup,
    AcceptedSuggestionEntry,
    session,
    CodeWhispererTracker,
    RecommendationHandler,
    CodeWhispererUserGroupSettings,
    AuthUtil,
} from 'aws-core-vscode/codewhisperer'
import { resetCodeWhispererGlobalVariables, createMockTextEditor } from 'aws-core-vscode/test'
import { assertTelemetryCurried, FakeExtensionContext } from 'aws-core-vscode/test'
import { globals } from 'aws-core-vscode/shared'
import { extensionVersion } from 'aws-core-vscode/shared'

describe('onAcceptance', function () {
    describe('onAcceptance', function () {
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
            session.reset()
        })

        afterEach(function () {
            sinon.restore()
            session.reset()
            CodeWhispererUserGroupSettings.instance.reset()
        })

        it('Should enqueue an event object to tracker', async function () {
            const mockEditor = createMockTextEditor()
            const trackerSpy = sinon.spy(CodeWhispererTracker.prototype, 'enqueue')
            const extensionContext = await FakeExtensionContext.create()
            const fakeReferences = [
                {
                    message: '',
                    licenseName: 'MIT',
                    repository: 'http://github.com/fake',
                    recommendationContentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ]
            await onAcceptance(
                {
                    editor: mockEditor,
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 26)),
                    effectiveRange: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 26)),
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    sessionId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                    references: fakeReferences,
                },
                extensionContext.globalState
            )
            const actualArg = trackerSpy.getCall(0).args[0] as AcceptedSuggestionEntry
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
            await globals.context.globalState.update(userGroupKey, {
                group: UserGroup.Control,
                version: extensionVersion,
            })

            const testStartUrl = 'testStartUrl'
            sinon.stub(AuthUtil.instance, 'startUrl').value(testStartUrl)
            const mockEditor = createMockTextEditor()
            session.requestIdList = ['test']
            RecommendationHandler.instance.requestId = 'test'
            session.sessionId = 'test'
            session.startPos = new vscode.Position(1, 0)
            mockEditor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0))
            session.recommendations = [{ content: "print('Hello World!')" }]
            session.setSuggestionState(0, 'Showed')
            session.triggerType = 'OnDemand'
            session.setCompletionType(0, session.recommendations[0])
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userDecision')
            const extensionContext = await FakeExtensionContext.create()
            await onAcceptance(
                {
                    editor: mockEditor,
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 21)),
                    effectiveRange: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 26)),
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    sessionId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                    references: undefined,
                },
                extensionContext.globalState
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
                codewhispererUserGroup: 'Control',
            })
        })
    })
})
