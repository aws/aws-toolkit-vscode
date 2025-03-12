/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { resetCodeWhispererGlobalVariables, createMockTextEditor } from 'aws-core-vscode/test'
import { onInlineAcceptance, RecommendationHandler, session } from 'aws-core-vscode/codewhisperer'

describe('onInlineAcceptance', function () {
    describe('onInlineAcceptance', function () {
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
            session.reset()
        })

        afterEach(function () {
            sinon.restore()
            session.reset()
        })

        it('Should dispose inline completion provider', async function () {
            const mockEditor = createMockTextEditor()
            const spy = sinon.spy(RecommendationHandler.instance, 'disposeInlineCompletion')
            await onInlineAcceptance({
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
            })
            assert.ok(spy.calledWith())
        })
    })
})
