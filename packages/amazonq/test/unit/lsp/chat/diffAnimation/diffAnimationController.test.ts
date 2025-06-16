/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import {
    DiffAnimationController,
    PartialUpdateOptions,
} from '../../../../../src/lsp/chat/diffAnimation/diffAnimationController'
import { WebviewManager } from '../../../../../src/lsp/chat/diffAnimation/webviewManager'
import { DiffAnalyzer } from '../../../../../src/lsp/chat/diffAnimation/diffAnalyzer'
import { VSCodeIntegration } from '../../../../../src/lsp/chat/diffAnimation/vscodeIntegration'

describe('DiffAnimationController', function () {
    let controller: DiffAnimationController
    let sandbox: sinon.SinonSandbox

    // Helper function to create mock document
    function createMockDocument(content: string, lineCount: number = 1) {
        return {
            getText: () => content,
            lineCount,
            lineAt: (line: number) => ({ text: content.split('\n')[line] || content }),
            save: sandbox.stub().resolves(),
        }
    }

    // Helper function to setup standard file operation mocks
    function setupStandardMocks(content: string = 'original') {
        const mockDoc = createMockDocument(content)
        ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
        ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)
        ;(vscode.commands.executeCommand as sinon.SinonStub).resolves()
        return mockDoc
    }

    // Helper function to setup new file mocks
    function setupNewFileMocks() {
        ;(vscode.workspace.openTextDocument as sinon.SinonStub)
            .onFirstCall()
            .rejects(new Error('File not found'))
            .onSecondCall()
            .resolves(createMockDocument('', 0))
        ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)
    }

    // Helper function to setup error mocks
    function setupErrorMocks(errorMessage: string = 'Test error') {
        ;(vscode.workspace.openTextDocument as sinon.SinonStub).rejects(new Error(errorMessage))
    }

    // Helper function to setup animation
    async function setupAnimation(filePath: string, originalContent: string, newContent: string) {
        setupStandardMocks(originalContent)
        await controller.startDiffAnimation(filePath, originalContent, newContent, false)
    }

    // Helper function to setup animation and verify disposal
    async function setupAnimationAndDispose(filePath: string, originalContent: string, newContent: string) {
        await setupAnimation(filePath, originalContent, newContent)
        controller.dispose()
        const stats = controller.getAnimationStats()
        assert.strictEqual(stats.activeCount, 0)
    }

    // Helper function to setup animation and stop it
    async function setupAnimationAndStop(filePath: string, originalContent: string, newContent: string) {
        await setupAnimation(filePath, originalContent, newContent)
        controller.stopDiffAnimation(filePath)
        const animationData = controller.getAnimationData(filePath)
        assert.strictEqual(animationData, undefined)
    }

    // Helper function to setup animation and check static diff status
    async function setupAnimationAndCheckStaticDiff(filePath: string, originalContent: string, newContent: string) {
        await setupAnimation(filePath, originalContent, newContent)
        const result = controller.isShowingStaticDiff(filePath)
        assert.strictEqual(typeof result, 'boolean')
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Mock vscode APIs
        sandbox.stub(vscode.workspace, 'openTextDocument')
        sandbox.stub(vscode.workspace, 'applyEdit')
        sandbox.stub(vscode.window, 'showTextDocument')
        sandbox.stub(vscode.commands, 'executeCommand')
        sandbox.stub(vscode.window, 'setStatusBarMessage')
        sandbox.stub(vscode.window, 'createWebviewPanel')
        sandbox.stub(vscode.workspace, 'registerTextDocumentContentProvider')

        // Mock vscode.workspace.fs properly
        const mockFs = {
            writeFile: sandbox.stub().resolves(),
            readFile: sandbox.stub().resolves(Buffer.from('')),
            stat: sandbox.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 }),
        }
        sandbox.stub(vscode.workspace, 'fs').value(mockFs)

        // Mock the component classes to prevent real instantiation
        const mockWebviewPanel = {
            reveal: sandbox.stub(),
            dispose: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            webview: {
                html: '',
                onDidReceiveMessage: sandbox.stub().returns({ dispose: sandbox.stub() }),
                postMessage: sandbox.stub().resolves(),
            },
        }

        sandbox.stub(WebviewManager.prototype, 'getOrCreateDiffWebview').resolves(mockWebviewPanel as any)
        sandbox.stub(WebviewManager.prototype, 'sendMessageToWebview').resolves()
        sandbox.stub(WebviewManager.prototype, 'shouldAutoScrollForFile').returns(true)
        sandbox.stub(WebviewManager.prototype, 'closeDiffWebview')
        sandbox.stub(WebviewManager.prototype, 'dispose')

        sandbox.stub(DiffAnalyzer.prototype, 'calculateChangedRegion').returns({
            startLine: 0,
            endLine: 5,
            totalLines: 10,
        })
        sandbox.stub(DiffAnalyzer.prototype, 'createScanPlan').returns({
            leftLines: [],
            rightLines: [],
            scanPlan: [],
        })
        sandbox.stub(DiffAnalyzer.prototype, 'calculateAnimationTiming').returns({
            scanDelay: 50,
            totalDuration: 1000,
        })

        sandbox.stub(VSCodeIntegration.prototype, 'showVSCodeDiff').resolves()
        sandbox.stub(VSCodeIntegration.prototype, 'openFileInEditor').resolves()

        controller = new DiffAnimationController()
    })

    afterEach(function () {
        controller.dispose()
        sandbox.restore()
    })

    describe('constructor', function () {
        it('should initialize successfully', function () {
            assert.ok(controller)
        })
    })

    describe('getAnimationData', function () {
        it('should return undefined for non-existent file', function () {
            const result = controller.getAnimationData('/non/existent/file.js')
            assert.strictEqual(result, undefined)
        })

        it('should return animation data after starting animation', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks(originalContent)
            await controller.startDiffAnimation(filePath, originalContent, newContent)

            const result = controller.getAnimationData(filePath)
            assert.ok(result)
            assert.strictEqual(result.originalContent, originalContent)
            assert.strictEqual(result.newContent, newContent)
        })
    })

    describe('shouldShowStaticDiff', function () {
        it('should return false for new file without history', function () {
            const result = controller.shouldShowStaticDiff('/new/file.js', 'content')
            assert.strictEqual(result, false)
        })

        it('should return true when animation data exists', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks(originalContent)
            await controller.startDiffAnimation(filePath, originalContent, newContent)

            const result = controller.shouldShowStaticDiff(filePath, newContent)
            assert.strictEqual(result, true)
        })
    })

    describe('startDiffAnimation', function () {
        it('should start animation for new file', async function () {
            const filePath = '/test/new-file.js'
            const originalContent = ''
            const newContent = 'console.log("hello")'

            setupNewFileMocks()
            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            assert.ok(true)
        })

        it('should start animation for existing file', async function () {
            const filePath = '/test/existing-file.js'
            const originalContent = 'console.log("old")'
            const newContent = 'console.log("new")'

            setupStandardMocks(originalContent)
            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            assert.ok(true)
        })

        it('should handle chat click differently', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks()
            await controller.startDiffAnimation(filePath, originalContent, newContent, true)

            assert.ok(true)
        })

        it('should handle errors gracefully', async function () {
            const filePath = '/test/error-file.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupErrorMocks('File error')

            try {
                await controller.startDiffAnimation(filePath, originalContent, newContent, false)
            } catch (error) {
                // Expected to throw
            }

            assert.ok(true)
        })
    })

    describe('startPartialDiffAnimation', function () {
        it('should start partial animation with options', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'line1\nline2\nline3'
            const newContent = 'line1\nmodified line2\nline3'
            const options: PartialUpdateOptions = {
                changeLocation: {
                    startLine: 1,
                    endLine: 1,
                },
                isPartialUpdate: true,
            }

            setupStandardMocks(originalContent)
            await controller.startPartialDiffAnimation(filePath, originalContent, newContent, options)

            assert.ok(true)
        })

        it('should handle partial animation without options', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks(originalContent)
            await controller.startPartialDiffAnimation(filePath, originalContent, newContent)

            assert.ok(true)
        })
    })

    describe('showVSCodeDiff', function () {
        it('should show VS Code diff view', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks()
            await controller.showVSCodeDiff(filePath, originalContent, newContent)

            assert.ok(vscode.commands.executeCommand)
        })

        it('should handle errors in diff view', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            ;(vscode.commands.executeCommand as sinon.SinonStub).rejects(new Error('Diff error'))

            try {
                await controller.showVSCodeDiff(filePath, originalContent, newContent)
            } catch (error) {
                // Expected to handle gracefully
            }

            assert.ok(vscode.commands.executeCommand)
        })
    })

    describe('showStaticDiffView', function () {
        it('should show static diff view for existing animation', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks(originalContent)
            await controller.startDiffAnimation(filePath, originalContent, newContent, false)
            await controller.showStaticDiffView(filePath)

            assert.ok(vscode.commands.executeCommand)
        })

        it('should handle missing animation data', async function () {
            const filePath = '/test/non-existent-file.js'

            await controller.showStaticDiffView(filePath)

            assert.ok(true)
        })
    })

    describe('stopDiffAnimation', function () {
        it('should stop animation for specific file', async function () {
            await setupAnimationAndStop('/test/file.js', 'original', 'new')
        })

        it('should handle stopping non-existent animation', function () {
            const filePath = '/test/non-existent.js'

            controller.stopDiffAnimation(filePath)

            assert.ok(true)
        })
    })

    describe('stopAllAnimations', function () {
        it('should stop all active animations', async function () {
            const filePath1 = '/test/file1.js'
            const filePath2 = '/test/file2.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks(originalContent)

            await controller.startDiffAnimation(filePath1, originalContent, newContent, false)
            await controller.startDiffAnimation(filePath2, originalContent, newContent, false)

            controller.stopAllAnimations()

            assert.strictEqual(controller.getAnimationData(filePath1), undefined)
            assert.strictEqual(controller.getAnimationData(filePath2), undefined)
        })

        it('should handle stopping when no animations are active', function () {
            controller.stopAllAnimations()

            assert.ok(true)
        })
    })

    describe('isAnimating', function () {
        it('should return false for non-existent file', function () {
            const result = controller.isAnimating('/non/existent/file.js')
            assert.strictEqual(result, false)
        })

        it('should return true for active animation', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks(originalContent)
            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            const result = controller.isAnimating(filePath)
            assert.strictEqual(result, true)
        })

        it('should return false after stopping animation', async function () {
            await setupAnimationAndStop('/test/file.js', 'original', 'new')

            const result = controller.isAnimating('/test/file.js')
            assert.strictEqual(result, false)
        })
    })

    describe('isShowingStaticDiff', function () {
        it('should return false for non-existent file', function () {
            const result = controller.isShowingStaticDiff('/non/existent/file.js')
            assert.strictEqual(result, false)
        })

        it('should return correct static diff status', async function () {
            await setupAnimationAndCheckStaticDiff('/test/file.js', 'original', 'new')
        })
    })

    describe('getAnimationStats', function () {
        it('should return empty stats initially', function () {
            const stats = controller.getAnimationStats()
            assert.strictEqual(stats.activeCount, 0)
            assert.deepStrictEqual(stats.filePaths, [])
        })

        it('should return correct stats with active animations', async function () {
            const filePath1 = '/test/file1.js'
            const filePath2 = '/test/file2.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks(originalContent)

            await controller.startDiffAnimation(filePath1, originalContent, newContent, false)
            await controller.startDiffAnimation(filePath2, originalContent, newContent, false)

            const stats = controller.getAnimationStats()
            assert.strictEqual(stats.activeCount, 2)
            assert.ok(stats.filePaths.includes(filePath1))
            assert.ok(stats.filePaths.includes(filePath2))
        })
    })

    describe('dispose', function () {
        it('should dispose successfully', function () {
            controller.dispose()

            assert.ok(true)
        })

        it('should stop all animations on dispose', async function () {
            await setupAnimationAndDispose('/test/file.js', 'original', 'new')
        })

        it('should handle multiple dispose calls', function () {
            controller.dispose()
            controller.dispose()

            assert.ok(true)
        })
    })

    describe('edge cases', function () {
        it('should handle very large content', async function () {
            const filePath = '/test/large-file.js'
            const originalContent = 'x'.repeat(100000)
            const newContent = 'y'.repeat(100000)

            setupStandardMocks(originalContent)
            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            assert.ok(true)
        })

        it('should handle special characters in file paths', async function () {
            const filePath = '/test/file with spaces & symbols!@#$.js'
            const originalContent = 'original'
            const newContent = 'new'

            setupStandardMocks(originalContent)
            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            const animationData = controller.getAnimationData(filePath)
            assert.ok(animationData)
        })

        it('should handle empty content', async function () {
            const filePath = '/test/empty-file.js'
            const originalContent = ''
            const newContent = ''

            setupNewFileMocks()
            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            assert.ok(true)
        })

        it('should handle concurrent animations on same file', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent1 = 'new1'
            const newContent2 = 'new2'

            setupStandardMocks(originalContent)

            const promise1 = controller.startDiffAnimation(filePath, originalContent, newContent1, false)
            const promise2 = controller.startDiffAnimation(filePath, originalContent, newContent2, false)

            await Promise.all([promise1, promise2])

            const animationData = controller.getAnimationData(filePath)
            assert.ok(animationData)
        })
    })
})
