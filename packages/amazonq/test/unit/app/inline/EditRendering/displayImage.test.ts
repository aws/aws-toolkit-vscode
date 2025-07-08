/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { EditDecorationManager } from '../../../../../src/app/inline/EditRendering/displayImage'

describe('EditDecorationManager', function () {
    let sandbox: sinon.SinonSandbox
    let editorStub: sinon.SinonStubbedInstance<vscode.TextEditor>
    let documentStub: sinon.SinonStubbedInstance<vscode.TextDocument>
    let windowStub: sinon.SinonStubbedInstance<typeof vscode.window>
    let commandsStub: sinon.SinonStubbedInstance<typeof vscode.commands>
    let decorationTypeStub: sinon.SinonStubbedInstance<vscode.TextEditorDecorationType>
    let manager: EditDecorationManager

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Create stubs for vscode objects
        decorationTypeStub = {
            dispose: sandbox.stub(),
        } as unknown as sinon.SinonStubbedInstance<vscode.TextEditorDecorationType>

        documentStub = {
            getText: sandbox.stub().returns('Original code content'),
            lineCount: 5,
            lineAt: sandbox.stub().returns({
                text: 'Line text content',
                range: new vscode.Range(0, 0, 0, 18),
                rangeIncludingLineBreak: new vscode.Range(0, 0, 0, 19),
                firstNonWhitespaceCharacterIndex: 0,
                isEmptyOrWhitespace: false,
            }),
        } as unknown as sinon.SinonStubbedInstance<vscode.TextDocument>

        editorStub = {
            document: documentStub,
            setDecorations: sandbox.stub(),
            edit: sandbox.stub().resolves(true),
        } as unknown as sinon.SinonStubbedInstance<vscode.TextEditor>

        windowStub = sandbox.stub(vscode.window)
        windowStub.createTextEditorDecorationType.returns(decorationTypeStub as any)

        commandsStub = sandbox.stub(vscode.commands)
        commandsStub.registerCommand.returns({ dispose: sandbox.stub() })

        // Create a new instance of EditDecorationManager for each test
        manager = new EditDecorationManager()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should display SVG decorations in the editor', async function () {
        // Create a fake SVG image URI
        const svgUri = vscode.Uri.parse('file:///path/to/image.svg')

        // Create accept and reject handlers
        const acceptHandler = sandbox.stub()
        const rejectHandler = sandbox.stub()

        // Reset the setDecorations stub to clear any previous calls
        editorStub.setDecorations.reset()

        // Call displayEditSuggestion
        await manager.displayEditSuggestion(
            editorStub as unknown as vscode.TextEditor,
            svgUri,
            0,
            acceptHandler,
            rejectHandler,
            'Original code',
            'New code',
            [{ line: 0, start: 0, end: 0 }]
        )

        // Verify decorations were set (we expect 4 calls because clearDecorations is called first)
        assert.strictEqual(editorStub.setDecorations.callCount, 4)

        // Verify the third call is for the image decoration (after clearDecorations)
        const imageCall = editorStub.setDecorations.getCall(2)
        assert.strictEqual(imageCall.args[0], manager['imageDecorationType'])
        assert.strictEqual(imageCall.args[1].length, 1)

        // Verify the fourth call is for the removed code decoration
        const removedCodeCall = editorStub.setDecorations.getCall(3)
        assert.strictEqual(removedCodeCall.args[0], manager['removedCodeDecorationType'])
    })

    // Helper function to setup edit suggestion test
    async function setupEditSuggestionTest() {
        // Create a fake SVG image URI
        const svgUri = vscode.Uri.parse('file:///path/to/image.svg')

        // Create accept and reject handlers
        const acceptHandler = sandbox.stub()
        const rejectHandler = sandbox.stub()

        // Display the edit suggestion
        await manager.displayEditSuggestion(
            editorStub as unknown as vscode.TextEditor,
            svgUri,
            0,
            acceptHandler,
            rejectHandler,
            'Original code',
            'New code',
            [{ line: 0, start: 0, end: 0 }]
        )

        return { acceptHandler, rejectHandler }
    }

    it('should trigger accept handler when command is executed', async function () {
        const { acceptHandler, rejectHandler } = await setupEditSuggestionTest()

        // Find the command handler that was registered for accept
        const acceptCommandArgs = commandsStub.registerCommand.args.find(
            (args) => args[0] === 'aws.amazonq.inline.acceptEdit'
        )

        // Execute the accept command handler if found
        if (acceptCommandArgs && acceptCommandArgs[1]) {
            const acceptCommandHandler = acceptCommandArgs[1]
            acceptCommandHandler()

            // Verify the accept handler was called
            sinon.assert.calledOnce(acceptHandler)
            sinon.assert.notCalled(rejectHandler)
        } else {
            assert.fail('Accept command handler not found')
        }
    })

    it('should trigger reject handler when command is executed', async function () {
        const { acceptHandler, rejectHandler } = await setupEditSuggestionTest()

        // Find the command handler that was registered for reject
        const rejectCommandArgs = commandsStub.registerCommand.args.find(
            (args) => args[0] === 'aws.amazonq.inline.rejectEdit'
        )

        // Execute the reject command handler if found
        if (rejectCommandArgs && rejectCommandArgs[1]) {
            const rejectCommandHandler = rejectCommandArgs[1]
            rejectCommandHandler()

            // Verify the reject handler was called
            sinon.assert.calledOnce(rejectHandler)
            sinon.assert.notCalled(acceptHandler)
        } else {
            assert.fail('Reject command handler not found')
        }
    })

    it('should clear decorations when requested', async function () {
        // Reset the setDecorations stub to clear any previous calls
        editorStub.setDecorations.reset()

        // Call clearDecorations
        await manager.clearDecorations(editorStub as unknown as vscode.TextEditor)

        // Verify decorations were cleared
        assert.strictEqual(editorStub.setDecorations.callCount, 2)

        // Verify both decoration types were cleared
        sinon.assert.calledWith(editorStub.setDecorations.firstCall, manager['imageDecorationType'], [])
        sinon.assert.calledWith(editorStub.setDecorations.secondCall, manager['removedCodeDecorationType'], [])
    })
})
