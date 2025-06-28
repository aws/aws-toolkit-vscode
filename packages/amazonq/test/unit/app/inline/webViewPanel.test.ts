/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { NextEditPredictionPanel } from '../../../../src/app/inline/webViewPanel'

describe('NextEditPredictionPanel', function () {
    let sandbox: sinon.SinonSandbox
    let statusBarStub: sinon.SinonStubbedInstance<vscode.StatusBarItem>
    let windowStub: sinon.SinonStubbedInstance<typeof vscode.window>
    let commandsStub: sinon.SinonStubbedInstance<typeof vscode.commands>
    let panel: NextEditPredictionPanel
    let webviewPanelStub: sinon.SinonStubbedInstance<vscode.WebviewPanel>
    let workspaceStub: sinon.SinonStubbedInstance<typeof vscode.workspace>
    let fileSystemWatcherStub: sinon.SinonStubbedInstance<vscode.FileSystemWatcher>

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Create a proper stub for the status bar item
        statusBarStub = {
            text: '',
            tooltip: '',
            command: '',
            show: sandbox.stub(),
            dispose: sandbox.stub(),
            backgroundColor: undefined,
        } as unknown as sinon.SinonStubbedInstance<vscode.StatusBarItem>

        // Create a stub for the webview panel with a proper webview object
        const webviewStub = {
            html: '',
            onDidReceiveMessage: sandbox.stub().returns({ dispose: sandbox.stub() }),
        }

        webviewPanelStub = {
            dispose: sandbox.stub(),
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            webview: webviewStub,
        } as unknown as sinon.SinonStubbedInstance<vscode.WebviewPanel>

        // Create a stub for the file system watcher
        fileSystemWatcherStub = {
            onDidChange: sandbox.stub().returns({ dispose: sandbox.stub() }),
            onDidCreate: sandbox.stub().returns({ dispose: sandbox.stub() }),
            onDidDelete: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub(),
        } as unknown as sinon.SinonStubbedInstance<vscode.FileSystemWatcher>

        // Stub vscode.window.createStatusBarItem to return our statusBarStub
        windowStub = sandbox.stub(vscode.window)
        windowStub.createStatusBarItem.returns(statusBarStub as any)
        windowStub.createWebviewPanel.returns(webviewPanelStub as any)

        // Stub vscode.commands.registerCommand
        commandsStub = sandbox.stub(vscode.commands)
        commandsStub.registerCommand.returns({ dispose: sandbox.stub() })

        // Stub vscode.workspace
        workspaceStub = sandbox.stub(vscode.workspace)
        workspaceStub.createFileSystemWatcher.returns(fileSystemWatcherStub as any)

        // Setup clock for timers
        sandbox.useFakeTimers()

        // Reset any existing instance to ensure we create a new one
        // This is needed because NextEditPredictionPanel uses a singleton pattern
        const anyPanel = NextEditPredictionPanel as any
        anyPanel.instance = undefined

        // Get the panel instance
        panel = NextEditPredictionPanel.getInstance()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should initialize status bar item with correct properties', function () {
        assert.strictEqual(statusBarStub.text, '$(eye) NEP')
        assert.strictEqual(statusBarStub.tooltip, 'Toggle Next Edit Prediction Panel')
        assert.strictEqual(statusBarStub.command, 'aws.amazonq.toggleNextEditPredictionPanel')
        sinon.assert.calledOnce(statusBarStub.show)
    })

    it('should toggle panel visibility when command is executed', function () {
        // Get the command handler that was registered
        const toggleCommandHandler = commandsStub.registerCommand.firstCall.args[1]

        // Execute the toggle command to show the panel
        toggleCommandHandler()

        // Verify the panel was created and shown
        sinon.assert.calledOnce(windowStub.createWebviewPanel)
        assert.strictEqual(windowStub.createWebviewPanel.firstCall.args[0], 'nextEditPrediction')
        assert.strictEqual(windowStub.createWebviewPanel.firstCall.args[1], 'Next Edit Prediction')

        // Execute the toggle command again to hide the panel
        toggleCommandHandler()

        // Verify the panel was disposed
        sinon.assert.calledOnce(webviewPanelStub.dispose)
    })

    it('should update panel content with new text', function () {
        // First show the panel
        const toggleCommandHandler = commandsStub.registerCommand.firstCall.args[1]
        toggleCommandHandler()

        // Update the content
        const testContent = 'Test content update'
        panel.updateContent(testContent)

        // Verify the webview HTML was updated (it should contain some HTML content)
        assert.ok(typeof webviewPanelStub.webview.html === 'string')
        assert.ok(webviewPanelStub.webview.html.length > 0)
    })

    it('should setup file watcher when panel is shown', function () {
        // First show the panel to trigger file watcher setup
        const toggleCommandHandler = commandsStub.registerCommand.firstCall.args[1]
        toggleCommandHandler()

        // Verify file system watcher was created
        sinon.assert.calledOnce(workspaceStub.createFileSystemWatcher)

        // Verify the change handler was registered
        sinon.assert.calledOnce(fileSystemWatcherStub.onDidChange)
    })

    it('should properly dispose resources when closed', function () {
        // First show the panel to create resources
        const toggleCommandHandler = commandsStub.registerCommand.firstCall.args[1]
        toggleCommandHandler()

        // Now dispose the panel
        panel.dispose()

        // Verify status bar item was disposed
        assert.ok(statusBarStub.dispose.called)

        // Verify file watcher was disposed if it was created
        assert.ok(fileSystemWatcherStub.dispose.called)

        // Verify panel was disposed if it was created
        assert.ok(webviewPanelStub.dispose.called)
    })
})
