/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { onAcceptance, AcceptedSuggestionEntry, session, CodeWhispererTracker } from 'aws-core-vscode/codewhisperer'
import { resetCodeWhispererGlobalVariables, createMockTextEditor } from 'aws-core-vscode/test'

describe('onAcceptance', function () {
    describe('onAcceptance', function () {
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
            session.reset()
        })

        afterEach(function () {
            sinon.restore()
            session.reset()
        })

        it('Should enqueue an event object to tracker', async function () {
            const mockEditor = createMockTextEditor()
            const trackerSpy = sinon.spy(CodeWhispererTracker.prototype, 'enqueue')
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
            await onAcceptance({
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
            })
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
    })
})
