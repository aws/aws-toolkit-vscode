/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { EditorContentController, ViewDiffMessage } from '../../../../amazonq/commons/controllers/contentController'
import * as textDocumentUtilities from '../../../../shared/utilities/textDocumentUtilities'
import * as textUtilities from '../../../../shared/utilities/textUtilities'
import { amazonQDiffScheme, amazonQTabSuffix } from '../../../../shared/constants'
import * as editorUtilities from '../../../../shared/utilities/editorUtilities'

describe('EditorContentController', () => {
    let sandbox: sinon.SinonSandbox
    let controller: EditorContentController
    let executeCommandStub: sinon.SinonStub
    let registerTextDocumentContentProviderStub: sinon.SinonStub
    let createTempUrisForDiffStub: sinon.SinonStub
    let disposeOnEditorCloseStub: sinon.SinonStub
    let extractParamsFromMessageStub: sinon.SinonStub

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        controller = new EditorContentController()

        // Stub VS Code API calls
        executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves()
        registerTextDocumentContentProviderStub = sandbox
            .stub(vscode.workspace, 'registerTextDocumentContentProvider')
            .returns({ dispose: () => {} })

        // Stub utility functions
        createTempUrisForDiffStub = sandbox.stub(textDocumentUtilities, 'createTempUrisForDiff')
        disposeOnEditorCloseStub = sandbox.stub(editorUtilities, 'disposeOnEditorClose')
        extractParamsFromMessageStub = sandbox.stub(textUtilities, 'extractFileAndCodeSelectionFromMessage')
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('viewDiff', () => {
        const testFilePath = '/path/to/testFile.js'
        const testCode = 'new code'
        const testSelection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(2, 0))
        const testMessage: ViewDiffMessage = {
            code: testCode,
        }
        const originalUri = vscode.Uri.parse('test-scheme:/original/testFile.js')
        const modifiedUri = vscode.Uri.parse('test-scheme:/modified/testFile.js')

        beforeEach(() => {
            extractParamsFromMessageStub.returns({
                filePath: testFilePath,
                selection: testSelection,
            })
            createTempUrisForDiffStub.resolves([originalUri, modifiedUri])
        })

        it('should show diff view with correct URIs and title', async () => {
            await controller.viewDiff(testMessage)

            // Verify content provider was registered
            assert.strictEqual(registerTextDocumentContentProviderStub.calledOnce, true)
            assert.strictEqual(registerTextDocumentContentProviderStub.firstCall.args[0], amazonQDiffScheme)

            // Verify createTempUrisForDiff was called with correct parameters
            assert.strictEqual(createTempUrisForDiffStub.calledOnce, true)
            assert.strictEqual(createTempUrisForDiffStub.firstCall.args[0], testFilePath)
            assert.strictEqual(createTempUrisForDiffStub.firstCall.args[2], testMessage)
            assert.strictEqual(createTempUrisForDiffStub.firstCall.args[3], testSelection)
            assert.strictEqual(createTempUrisForDiffStub.firstCall.args[4], amazonQDiffScheme)

            // Verify vscode.diff command was executed with correct parameters
            assert.strictEqual(executeCommandStub.calledOnce, true)
            assert.strictEqual(executeCommandStub.firstCall.args[0], 'vscode.diff')
            assert.strictEqual(executeCommandStub.firstCall.args[1], originalUri)
            assert.strictEqual(executeCommandStub.firstCall.args[2], modifiedUri)
            assert.strictEqual(executeCommandStub.firstCall.args[3], `testFile.js ${amazonQTabSuffix}`)

            // Verify disposeOnEditorClose was called
            assert.strictEqual(disposeOnEditorCloseStub.calledOnce, true)
            assert.strictEqual(disposeOnEditorCloseStub.firstCall.args[0], originalUri)
        })

        it('should use custom scheme when provided', async () => {
            const customScheme = 'custom-scheme'
            await controller.viewDiff(testMessage, customScheme)

            assert.strictEqual(registerTextDocumentContentProviderStub.firstCall.args[0], customScheme)
            assert.strictEqual(createTempUrisForDiffStub.firstCall.args[4], customScheme)
        })

        it('should pass fileText to createTempUrisForDiff when available', async () => {
            const testFileText = 'original file content'
            extractParamsFromMessageStub.returns({
                filePath: testFilePath,
                fileText: testFileText,
                selection: testSelection,
            })

            await controller.viewDiff(testMessage)

            assert.strictEqual(createTempUrisForDiffStub.firstCall.args[1], testFileText)
        })

        it('should not attempt to show diff when filePath is missing', async () => {
            extractParamsFromMessageStub.returns({
                filePath: undefined,
                selection: testSelection,
            })

            await controller.viewDiff(testMessage)

            assert.strictEqual(registerTextDocumentContentProviderStub.called, false)
            assert.strictEqual(createTempUrisForDiffStub.called, false)
            assert.strictEqual(executeCommandStub.called, false)
        })

        it('should not attempt to show diff when code is missing', async () => {
            await controller.viewDiff({ code: undefined as unknown as string })

            assert.strictEqual(registerTextDocumentContentProviderStub.called, false)
            assert.strictEqual(createTempUrisForDiffStub.called, false)
            assert.strictEqual(executeCommandStub.called, false)
        })

        it('should not attempt to show diff when selection is missing', async () => {
            extractParamsFromMessageStub.returns({
                filePath: testFilePath,
                selection: undefined,
            })

            await controller.viewDiff(testMessage)

            assert.strictEqual(registerTextDocumentContentProviderStub.called, false)
            assert.strictEqual(createTempUrisForDiffStub.called, false)
            assert.strictEqual(executeCommandStub.called, false)
        })
    })
})
