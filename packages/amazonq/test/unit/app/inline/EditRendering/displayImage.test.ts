/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { EditDecorationManager, displaySvgDecoration } from '../../../../../src/app/inline/EditRendering/displayImage'
import { EditSuggestionState } from '../../../../../src/app/inline/editSuggestionState'

// Shared helper function to create common stubs
function createCommonStubs(sandbox: sinon.SinonSandbox) {
    const documentStub = {
        getText: sandbox.stub().returns('Original code content'),
        uri: vscode.Uri.file('/test/file.ts'),
        lineAt: sandbox.stub().returns({
            text: 'Line text content',
            range: new vscode.Range(0, 0, 0, 18),
            rangeIncludingLineBreak: new vscode.Range(0, 0, 0, 19),
            firstNonWhitespaceCharacterIndex: 0,
            isEmptyOrWhitespace: false,
        }),
    } as unknown as sinon.SinonStubbedInstance<vscode.TextDocument>

    const editorStub = {
        document: documentStub,
        setDecorations: sandbox.stub(),
    } as unknown as sinon.SinonStubbedInstance<vscode.TextEditor>

    return { documentStub, editorStub }
}

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

        const commonStubs = createCommonStubs(sandbox)
        documentStub = commonStubs.documentStub
        editorStub = commonStubs.editorStub

        // Add additional properties needed for this test suite - extend the stub objects
        Object.assign(documentStub, { lineCount: 5 })
        Object.assign(editorStub, { edit: sandbox.stub().resolves(true) })

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
        await manager.clearDecorations(editorStub as unknown as vscode.TextEditor, [])

        // Verify decorations were cleared
        assert.strictEqual(editorStub.setDecorations.callCount, 2)

        // Verify both decoration types were cleared
        sinon.assert.calledWith(editorStub.setDecorations.firstCall, manager['imageDecorationType'], [])
        sinon.assert.calledWith(editorStub.setDecorations.secondCall, manager['removedCodeDecorationType'], [])
    })
})

describe('displaySvgDecoration cursor distance auto-discard', function () {
    let sandbox: sinon.SinonSandbox
    let editorStub: sinon.SinonStubbedInstance<vscode.TextEditor>
    let languageClientStub: any
    let sessionStub: any
    let itemStub: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        const commonStubs = createCommonStubs(sandbox)
        editorStub = commonStubs.editorStub

        languageClientStub = {
            sendNotification: sandbox.stub(),
        }

        sessionStub = {
            sessionId: 'test-session',
            requestStartTime: Date.now(),
            firstCompletionDisplayLatency: 100,
        }

        itemStub = {
            itemId: 'test-item',
            insertText: 'test content',
        }
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should send discard telemetry and return early when edit is 10+ lines away from cursor', async function () {
        // Set cursor at line 5
        editorStub.selection = {
            active: new vscode.Position(5, 0),
        } as any
        // Try to display edit at line 20 (15 lines away)
        await displaySvgDecoration(
            editorStub as unknown as vscode.TextEditor,
            vscode.Uri.parse('data:image/svg+xml;base64,test'),
            20,
            'new code',
            [],
            sessionStub,
            languageClientStub,
            itemStub,
            []
        )

        // Verify discard telemetry was sent
        sinon.assert.calledOnce(languageClientStub.sendNotification)
        const call = languageClientStub.sendNotification.getCall(0)
        assert.strictEqual(call.args[0], 'aws/logInlineCompletionSessionResults')
        assert.strictEqual(call.args[1].sessionId, 'test-session')
        assert.strictEqual(call.args[1].completionSessionResult['test-item'].discarded, true)
    })

    it('should proceed normally when edit is within 10 lines of cursor', async function () {
        // Set cursor at line 5
        editorStub.selection = {
            active: new vscode.Position(5, 0),
        } as any
        // Mock required dependencies for normal flow
        sandbox.stub(vscode.workspace, 'onDidChangeTextDocument').returns({ dispose: sandbox.stub() })
        sandbox.stub(vscode.window, 'onDidChangeTextEditorSelection').returns({ dispose: sandbox.stub() })

        // Try to display edit at line 10 (5 lines away)
        await displaySvgDecoration(
            editorStub as unknown as vscode.TextEditor,
            vscode.Uri.parse('data:image/svg+xml;base64,test'),
            10,
            'new code',
            [],
            sessionStub,
            languageClientStub,
            itemStub,
            []
        )

        // Verify no discard telemetry was sent (function should proceed normally)
        sinon.assert.notCalled(languageClientStub.sendNotification)
    })
})

// TODO: reenable this test, need some updates after refactor
describe.skip('displaySvgDecoration cursor distance auto-reject', function () {
    let sandbox: sinon.SinonSandbox
    let editorStub: sinon.SinonStubbedInstance<vscode.TextEditor>
    let windowStub: sinon.SinonStub
    let commandsStub: sinon.SinonStub
    let editSuggestionStateStub: sinon.SinonStub
    let onDidChangeTextEditorSelectionStub: sinon.SinonStub
    let selectionChangeListener: (e: vscode.TextEditorSelectionChangeEvent) => void

    // Helper function to setup displaySvgDecoration
    async function setupDisplaySvgDecoration(startLine: number) {
        return await displaySvgDecoration(
            editorStub as unknown as vscode.TextEditor,
            vscode.Uri.parse('data:image/svg+xml;base64,test'),
            startLine,
            'new code',
            [],
            {} as any,
            {} as any,
            { itemId: 'test', insertText: 'patch' } as any,
            []
        )
    }

    // Helper function to create selection change event
    function createSelectionChangeEvent(line: number): vscode.TextEditorSelectionChangeEvent {
        const position = new vscode.Position(line, 0)
        const selection = new vscode.Selection(position, position)
        return {
            textEditor: editorStub,
            selections: [selection],
            kind: vscode.TextEditorSelectionChangeKind.Mouse,
        } as vscode.TextEditorSelectionChangeEvent
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        const commonStubs = createCommonStubs(sandbox)
        editorStub = commonStubs.editorStub

        // Mock vscode.window.onDidChangeTextEditorSelection
        onDidChangeTextEditorSelectionStub = sandbox.stub()
        onDidChangeTextEditorSelectionStub.returns({ dispose: sandbox.stub() })
        windowStub = sandbox.stub(vscode.window, 'onDidChangeTextEditorSelection')
        windowStub.callsFake((callback) => {
            selectionChangeListener = callback
            return { dispose: sandbox.stub() }
        })

        // Mock vscode.commands.executeCommand
        commandsStub = sandbox.stub(vscode.commands, 'executeCommand')

        // Mock EditSuggestionState
        editSuggestionStateStub = sandbox.stub(EditSuggestionState, 'isEditSuggestionActive')
        editSuggestionStateStub.returns(true)

        // Mock other required dependencies
        sandbox.stub(vscode.workspace, 'onDidChangeTextDocument').returns({ dispose: sandbox.stub() })
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should not reject when cursor moves less than 25 lines away', async function () {
        // Set cursor at line 50
        editorStub.selection = {
            active: new vscode.Position(50, 0),
        } as any
        const startLine = 50
        await setupDisplaySvgDecoration(startLine)

        selectionChangeListener(createSelectionChangeEvent(startLine + 24))

        sinon.assert.notCalled(commandsStub)
    })

    it('should not reject when cursor moves exactly 25 lines away', async function () {
        // Set cursor at line 50
        editorStub.selection = {
            active: new vscode.Position(50, 0),
        } as any
        const startLine = 50
        await setupDisplaySvgDecoration(startLine)

        selectionChangeListener(createSelectionChangeEvent(startLine + 25))

        sinon.assert.notCalled(commandsStub)
    })

    it('should reject when cursor moves more than 25 lines away', async function () {
        // Set cursor at line 50
        editorStub.selection = {
            active: new vscode.Position(50, 0),
        } as any
        const startLine = 50
        await setupDisplaySvgDecoration(startLine)

        selectionChangeListener(createSelectionChangeEvent(startLine + 26))

        sinon.assert.calledOnceWithExactly(commandsStub, 'aws.amazonq.inline.rejectEdit')
    })

    it('should reject when cursor moves more than 25 lines before the edit', async function () {
        // Set cursor at line 50
        editorStub.selection = {
            active: new vscode.Position(50, 0),
        } as any
        const startLine = 50
        await setupDisplaySvgDecoration(startLine)

        selectionChangeListener(createSelectionChangeEvent(startLine - 26))

        sinon.assert.calledOnceWithExactly(commandsStub, 'aws.amazonq.inline.rejectEdit')
    })

    it('should not reject when edit is near beginning of file and cursor cannot move far enough', async function () {
        // Set cursor at line 10
        editorStub.selection = {
            active: new vscode.Position(10, 0),
        } as any
        const startLine = 10
        await setupDisplaySvgDecoration(startLine)

        selectionChangeListener(createSelectionChangeEvent(0))

        sinon.assert.notCalled(commandsStub)
    })

    it('should not reject when edit suggestion is not active', async function () {
        // Set cursor at line 50
        editorStub.selection = {
            active: new vscode.Position(50, 0),
        } as any
        editSuggestionStateStub.returns(false)

        const startLine = 50
        await setupDisplaySvgDecoration(startLine)

        selectionChangeListener(createSelectionChangeEvent(startLine + 100))

        sinon.assert.notCalled(commandsStub)
    })
})
