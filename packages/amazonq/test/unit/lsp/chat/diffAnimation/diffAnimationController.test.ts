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

    // Test data constants
    const testPaths = {
        existing: '/test/existing-file.js',
        new: '/test/new-file.js',
        nonexistent: '/test/non-existent.js',
        specialChars: '/test/file with spaces & symbols!@#$.js',
        large: '/test/large-file.js',
        empty: '/test/empty-file.js',
        multiple1: '/test/file1.js',
        multiple2: '/test/file2.js',
    }

    const testContent = {
        original: 'console.log("original")',
        new: 'console.log("new")',
        multiline: 'line1\nline2\nline3',
        multilineModified: 'line1\nmodified line2\nline3',
        empty: '',
        large: 'x'.repeat(100000),
        largeNew: 'y'.repeat(100000),
    }

    // Helper functions
    function createMockDocument(content: string, lineCount: number = content.split('\n').length) {
        return {
            getText: () => content,
            lineCount,
            lineAt: (line: number) => ({ text: content.split('\n')[line] || content }),
            save: sandbox.stub().resolves(),
        }
    }

    function setupVSCodeMocks() {
        // Mock vscode APIs
        sandbox.stub(vscode.workspace, 'openTextDocument')
        sandbox.stub(vscode.workspace, 'applyEdit')
        sandbox.stub(vscode.window, 'showTextDocument')
        sandbox.stub(vscode.commands, 'executeCommand')
        sandbox.stub(vscode.window, 'setStatusBarMessage')
        sandbox.stub(vscode.window, 'createWebviewPanel')
        sandbox.stub(vscode.workspace, 'registerTextDocumentContentProvider')

        // Mock vscode.workspace.fs
        const mockFs = {
            writeFile: sandbox.stub().resolves(),
            readFile: sandbox.stub().resolves(Buffer.from('')),
            stat: sandbox.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 }),
        }
        sandbox.stub(vscode.workspace, 'fs').value(mockFs)
    }

    function setupComponentMocks() {
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
    }

    function setupFileOperationMocks(
        scenario: 'existing' | 'new' | 'error',
        content: string = testContent.original,
        errorMessage?: string
    ) {
        switch (scenario) {
            case 'existing': {
                const mockDoc = createMockDocument(content)
                ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
                ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)
                ;(vscode.commands.executeCommand as sinon.SinonStub).resolves()
                return mockDoc
            }
            case 'new':
                ;(vscode.workspace.openTextDocument as sinon.SinonStub)
                    .onFirstCall()
                    .rejects(new Error('File not found'))
                    .onSecondCall()
                    .resolves(createMockDocument('', 0))
                ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)
                break
            case 'error':
                ;(vscode.workspace.openTextDocument as sinon.SinonStub).rejects(new Error(errorMessage || 'Test error'))
                break
        }
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        setupVSCodeMocks()
        setupComponentMocks()
        controller = new DiffAnimationController()
    })

    afterEach(function () {
        controller.dispose()
        sandbox.restore()
    })

    describe('initialization', function () {
        it('should initialize successfully', function () {
            assert.ok(controller)
        })
    })

    describe('animation data management', function () {
        it('should return undefined for non-existent file', function () {
            const result = controller.getAnimationData(testPaths.nonexistent)
            assert.strictEqual(result, undefined)
        })

        it('should return animation data after starting animation', async function () {
            setupFileOperationMocks('existing', testContent.original)
            await controller.startDiffAnimation(testPaths.existing, testContent.original, testContent.new)

            const result = controller.getAnimationData(testPaths.existing)
            assert.ok(result)
            assert.strictEqual(result.originalContent, testContent.original)
            assert.strictEqual(result.newContent, testContent.new)
        })

        it('should handle multiple files independently', async function () {
            setupFileOperationMocks('existing', testContent.original)

            await controller.startDiffAnimation(testPaths.multiple1, testContent.original, testContent.new)
            await controller.startDiffAnimation(testPaths.multiple2, testContent.original, testContent.new)

            assert.ok(controller.getAnimationData(testPaths.multiple1))
            assert.ok(controller.getAnimationData(testPaths.multiple2))
        })
    })

    describe('static diff detection', function () {
        it('should return false for new file without history', function () {
            const result = controller.shouldShowStaticDiff(testPaths.new, testContent.new)
            assert.strictEqual(result, false)
        })

        it('should return true when animation data exists', async function () {
            setupFileOperationMocks('existing', testContent.original)
            await controller.startDiffAnimation(testPaths.existing, testContent.original, testContent.new)

            const result = controller.shouldShowStaticDiff(testPaths.existing, testContent.new)
            assert.strictEqual(result, true)
        })
    })

    describe('animation lifecycle', function () {
        describe('startDiffAnimation', function () {
            it('should start animation for new file', async function () {
                setupFileOperationMocks('new')
                await controller.startDiffAnimation(testPaths.new, testContent.empty, testContent.new, false)
                assert.ok(controller.getAnimationData(testPaths.new))
            })

            it('should start animation for existing file', async function () {
                setupFileOperationMocks('existing', testContent.original)
                await controller.startDiffAnimation(testPaths.existing, testContent.original, testContent.new, false)
                assert.ok(controller.getAnimationData(testPaths.existing))
            })

            it('should handle chat click parameter', async function () {
                setupFileOperationMocks('existing')
                await controller.startDiffAnimation(testPaths.existing, testContent.original, testContent.new, true)
                assert.ok(controller.getAnimationData(testPaths.existing))
            })

            it('should handle file operation errors', async function () {
                setupFileOperationMocks('error', '', 'File access denied')

                try {
                    await controller.startDiffAnimation(
                        testPaths.existing,
                        testContent.original,
                        testContent.new,
                        false
                    )
                } catch (error) {
                    // Expected to throw
                }
                // Should not have animation data on error
                assert.strictEqual(controller.getAnimationData(testPaths.existing), undefined)
            })
        })

        describe('startPartialDiffAnimation', function () {
            it('should start partial animation with options', async function () {
                const options: PartialUpdateOptions = {
                    changeLocation: { startLine: 1, endLine: 1 },
                    isPartialUpdate: true,
                }

                setupFileOperationMocks('existing', testContent.multiline)
                await controller.startPartialDiffAnimation(
                    testPaths.existing,
                    testContent.multiline,
                    testContent.multilineModified,
                    options
                )

                assert.ok(controller.getAnimationData(testPaths.existing))
            })

            it('should handle partial animation without options', async function () {
                setupFileOperationMocks('existing', testContent.original)
                await controller.startPartialDiffAnimation(testPaths.existing, testContent.original, testContent.new)
                assert.ok(controller.getAnimationData(testPaths.existing))
            })
        })

        describe('stopDiffAnimation', function () {
            it('should stop specific animation', async function () {
                setupFileOperationMocks('existing', testContent.original)
                await controller.startDiffAnimation(testPaths.existing, testContent.original, testContent.new, false)

                assert.strictEqual(controller.isAnimating(testPaths.existing), true)
                controller.stopDiffAnimation(testPaths.existing)
                assert.strictEqual(controller.isAnimating(testPaths.existing), false)
            })

            it('should handle stopping non-existent animation', function () {
                controller.stopDiffAnimation(testPaths.nonexistent)
                // Should not throw
                assert.ok(true)
            })
        })

        describe('stopAllAnimations', function () {
            it('should stop all active animations', async function () {
                setupFileOperationMocks('existing', testContent.original)

                await controller.startDiffAnimation(testPaths.multiple1, testContent.original, testContent.new, false)
                await controller.startDiffAnimation(testPaths.multiple2, testContent.original, testContent.new, false)

                controller.stopAllAnimations()

                assert.strictEqual(controller.getAnimationData(testPaths.multiple1), undefined)
                assert.strictEqual(controller.getAnimationData(testPaths.multiple2), undefined)
            })

            it('should handle stopping when no animations are active', function () {
                controller.stopAllAnimations()
                assert.ok(true)
            })
        })
    })

    describe('animation status queries', function () {
        it('should return false for non-existent file animation status', function () {
            assert.strictEqual(controller.isAnimating(testPaths.nonexistent), false)
        })

        it('should return true for active animation', async function () {
            setupFileOperationMocks('existing', testContent.original)
            await controller.startDiffAnimation(testPaths.existing, testContent.original, testContent.new, false)

            assert.strictEqual(controller.isAnimating(testPaths.existing), true)
        })

        it('should return false for non-existent static diff status', function () {
            assert.strictEqual(controller.isShowingStaticDiff(testPaths.nonexistent), false)
        })

        it('should return correct static diff status', async function () {
            setupFileOperationMocks('existing', testContent.original)
            await controller.startDiffAnimation(testPaths.existing, testContent.original, testContent.new, false)

            const result = controller.isShowingStaticDiff(testPaths.existing)
            assert.strictEqual(typeof result, 'boolean')
        })
    })

    describe('diff view operations', function () {
        it('should show VS Code diff view', async function () {
            setupFileOperationMocks('existing')
            await controller.showVSCodeDiff(testPaths.existing, testContent.original, testContent.new)

            assert.ok((vscode.commands.executeCommand as sinon.SinonStub).called)
        })

        it('should handle diff view errors gracefully', async function () {
            ;(vscode.commands.executeCommand as sinon.SinonStub).rejects(new Error('Diff error'))

            try {
                await controller.showVSCodeDiff(testPaths.existing, testContent.original, testContent.new)
            } catch (error) {
                // Should handle gracefully
            }

            assert.ok((vscode.commands.executeCommand as sinon.SinonStub).called)
        })

        it('should show static diff view for existing animation', async function () {
            setupFileOperationMocks('existing', testContent.original)
            await controller.startDiffAnimation(testPaths.existing, testContent.original, testContent.new, false)
            await controller.showStaticDiffView(testPaths.existing)

            assert.ok((vscode.commands.executeCommand as sinon.SinonStub).called)
        })

        it('should handle missing animation data in static diff view', async function () {
            await controller.showStaticDiffView(testPaths.nonexistent)
            // Should not throw
            assert.ok(true)
        })
    })

    describe('statistics and monitoring', function () {
        it('should return empty stats initially', function () {
            const stats = controller.getAnimationStats()
            assert.strictEqual(stats.activeCount, 0)
            assert.deepStrictEqual(stats.filePaths, [])
        })

        it('should return correct stats with active animations', async function () {
            setupFileOperationMocks('existing', testContent.original)

            await controller.startDiffAnimation(testPaths.multiple1, testContent.original, testContent.new, false)
            await controller.startDiffAnimation(testPaths.multiple2, testContent.original, testContent.new, false)

            const stats = controller.getAnimationStats()
            assert.strictEqual(stats.activeCount, 2)
            assert.ok(stats.filePaths.includes(testPaths.multiple1))
            assert.ok(stats.filePaths.includes(testPaths.multiple2))
        })
    })

    describe('resource management', function () {
        it('should dispose successfully', function () {
            controller.dispose()
            assert.ok(true)
        })

        it('should stop all animations on dispose', async function () {
            setupFileOperationMocks('existing', testContent.original)
            await controller.startDiffAnimation(testPaths.existing, testContent.original, testContent.new, false)

            controller.dispose()

            const stats = controller.getAnimationStats()
            assert.strictEqual(stats.activeCount, 0)
        })

        it('should handle multiple dispose calls', function () {
            controller.dispose()
            controller.dispose()
            assert.ok(true)
        })
    })

    describe('edge cases and robustness', function () {
        it('should handle very large content', async function () {
            setupFileOperationMocks('existing', testContent.large)
            await controller.startDiffAnimation(testPaths.large, testContent.large, testContent.largeNew, false)

            assert.ok(controller.getAnimationData(testPaths.large))
        })

        it('should handle special characters in file paths', async function () {
            setupFileOperationMocks('existing', testContent.original)
            await controller.startDiffAnimation(testPaths.specialChars, testContent.original, testContent.new, false)

            const animationData = controller.getAnimationData(testPaths.specialChars)
            assert.ok(animationData)
        })

        it('should handle empty content', async function () {
            setupFileOperationMocks('new')
            await controller.startDiffAnimation(testPaths.empty, testContent.empty, testContent.empty, false)

            assert.ok(controller.getAnimationData(testPaths.empty))
        })

        it('should handle concurrent animations on same file', async function () {
            setupFileOperationMocks('existing', testContent.original)

            const promise1 = controller.startDiffAnimation(testPaths.existing, testContent.original, 'new1', false)
            const promise2 = controller.startDiffAnimation(testPaths.existing, testContent.original, 'new2', false)

            await Promise.all([promise1, promise2])

            const animationData = controller.getAnimationData(testPaths.existing)
            assert.ok(animationData)
        })
    })
})
