/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { StreamingDiffController } from '../../../../../src/lsp/chat/diffAnimation/streamingDiffController'
import { DiffAnimationHandler } from '../../../../../src/lsp/chat/diffAnimation/diffAnimationHandler'
import { AnimationQueueManager } from '../../../../../src/lsp/chat/diffAnimation/animationQueueManager'

describe('DiffAnimation System', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('StreamingDiffController', () => {
        let controller: StreamingDiffController

        beforeEach(() => {
            // Mock VSCode module to avoid import issues
            const mockVscode = {
                workspace: {
                    registerTextDocumentContentProvider: sandbox.stub().returns({ dispose: sandbox.stub() }),
                    applyEdit: sandbox.stub().resolves(true),
                    openTextDocument: sandbox.stub().resolves({
                        getText: () => 'original content',
                        uri: { fsPath: '/test/file.ts' },
                        lineCount: 1,
                        save: sandbox.stub().resolves(true),
                    }),
                },
                window: {
                    createTextEditorDecorationType: sandbox.stub().returns({
                        key: 'test-decoration',
                        dispose: sandbox.stub(),
                    }),
                    setStatusBarMessage: sandbox.stub(),
                },
                Uri: {
                    file: sandbox.stub().returns({
                        scheme: 'file',
                        authority: '',
                        path: '/test/file.ts',
                        query: '',
                        fragment: '',
                        fsPath: '/test/file.ts',
                        with: sandbox.stub(),
                        toString: () => 'file:///test/file.ts',
                    }),
                },
                Range: sandbox.stub().returns({
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 16 },
                }),
            }

            // Replace the vscode module
            sandbox.stub(require.cache, 'vscode').value(mockVscode)

            controller = new StreamingDiffController()
        })

        afterEach(() => {
            controller.dispose()
        })

        it('should initialize without errors', () => {
            assert.ok(controller)
            assert.strictEqual(typeof controller.openStreamingDiffView, 'function')
            assert.strictEqual(typeof controller.streamContentUpdate, 'function')
            assert.strictEqual(typeof controller.closeDiffView, 'function')
        })

        it('should track streaming sessions', () => {
            const toolUseId = 'test-tool-123'
            const isActive = controller.isStreamingActive(toolUseId)
            assert.strictEqual(isActive, false)
        })

        it('should return streaming stats for non-existent session', () => {
            const toolUseId = 'non-existent-tool'
            const stats = controller.getStreamingStats(toolUseId)
            assert.strictEqual(stats, undefined)
        })

        it('should handle fsReplace parameters update', () => {
            const toolUseId = 'test-tool-123'
            const fsWriteParams = {
                command: 'strReplace',
                oldStr: 'old text',
                newStr: 'new text',
            }

            // Should not throw error even if session doesn't exist
            assert.doesNotThrow(() => {
                controller.updateFsWriteParams(toolUseId, fsWriteParams)
            })
        })

        it('should handle cleanup gracefully', async () => {
            await assert.doesNotReject(async () => {
                await controller.cleanupChatSession()
            })
        })
    })

    describe('DiffAnimationHandler', () => {
        let handler: DiffAnimationHandler

        beforeEach(() => {
            // Mock VSCode module
            const mockVscode = {
                workspace: {
                    registerTextDocumentContentProvider: sandbox.stub().returns({ dispose: sandbox.stub() }),
                    applyEdit: sandbox.stub().resolves(true),
                    openTextDocument: sandbox.stub().resolves({
                        getText: () => 'original content',
                        uri: { fsPath: '/test/file.ts' },
                        lineCount: 1,
                        save: sandbox.stub().resolves(true),
                    }),
                    workspaceFolders: [{ uri: { fsPath: '/test' } }],
                },
                window: {
                    createTextEditorDecorationType: sandbox.stub().returns({
                        key: 'test-decoration',
                        dispose: sandbox.stub(),
                    }),
                    setStatusBarMessage: sandbox.stub(),
                },
                Uri: {
                    file: sandbox.stub().returns({
                        scheme: 'file',
                        authority: '',
                        path: '/test/file.ts',
                        query: '',
                        fragment: '',
                        fsPath: '/test/file.ts',
                        with: sandbox.stub(),
                        toString: () => 'file:///test/file.ts',
                    }),
                },
            }

            sandbox.stub(require.cache, 'vscode').value(mockVscode)

            handler = new DiffAnimationHandler()
        })

        afterEach(async () => {
            await handler.dispose()
        })

        it('should initialize without errors', () => {
            assert.ok(handler)
            assert.strictEqual(typeof handler.startStreamingDiffSession, 'function')
            assert.strictEqual(typeof handler.streamContentUpdate, 'function')
        })

        it('should start streaming session with original content', async () => {
            const toolUseId = 'test-tool-456'
            const filePath = '/test/file.ts'
            const originalContent = 'console.log("hello world");'

            await assert.doesNotReject(async () => {
                await handler.startStreamingWithOriginalContent(toolUseId, filePath, originalContent)
            })
        })

        it('should handle streaming content updates', async () => {
            const toolUseId = 'test-tool-456'
            const partialContent = 'console.log("updated content");'

            // First start a session
            await handler.startStreamingWithOriginalContent(toolUseId, '/test/file.ts', 'original')

            await assert.doesNotReject(async () => {
                await handler.streamContentUpdate(toolUseId, partialContent, false)
            })
        })

        it('should handle final streaming update', async () => {
            const toolUseId = 'test-tool-456'
            const finalContent = 'console.log("final content");'

            // First start a session
            await handler.startStreamingWithOriginalContent(toolUseId, '/test/file.ts', 'original')

            await assert.doesNotReject(async () => {
                await handler.streamContentUpdate(toolUseId, finalContent, true)
            })
        })

        it('should check if streaming is active', () => {
            const toolUseId = 'test-tool-456'
            const isActive = handler.isStreamingActive(toolUseId)
            assert.strictEqual(typeof isActive, 'boolean')
        })
    })

    describe('AnimationQueueManager', () => {
        let queueManager: AnimationQueueManager
        let mockFileSystemManager: any
        let mockStartFullAnimation: sinon.SinonStub
        let mockStartPartialAnimation: sinon.SinonStub

        beforeEach(() => {
            mockFileSystemManager = {
                getCurrentFileContent: sandbox.stub().resolves('current content'),
            }
            mockStartFullAnimation = sandbox.stub().resolves()
            mockStartPartialAnimation = sandbox.stub().resolves()

            queueManager = new AnimationQueueManager(
                mockFileSystemManager,
                mockStartFullAnimation,
                mockStartPartialAnimation
            )
        })

        it('should initialize without errors', () => {
            assert.ok(queueManager)
            assert.strictEqual(typeof queueManager.isAnimating, 'function')
            assert.strictEqual(typeof queueManager.markAsAnimating, 'function')
            assert.strictEqual(typeof queueManager.markAsNotAnimating, 'function')
        })

        it('should track animation state', () => {
            const filePath = '/test/file.ts'
            assert.strictEqual(queueManager.isAnimating(filePath), false)

            queueManager.markAsAnimating(filePath)
            assert.strictEqual(queueManager.isAnimating(filePath), true)

            queueManager.markAsNotAnimating(filePath)
            assert.strictEqual(queueManager.isAnimating(filePath), false)
        })

        it('should provide animation statistics', () => {
            const stats = queueManager.getAnimationStats()
            assert.ok(stats)
            assert.strictEqual(typeof stats.animatingCount, 'number')
            assert.strictEqual(typeof stats.queuedCount, 'number')
            assert.ok(Array.isArray(stats.filePaths))
        })

        it('should clear all animations', () => {
            const filePath = '/test/file.ts'
            queueManager.markAsAnimating(filePath)
            assert.strictEqual(queueManager.isAnimating(filePath), true)

            queueManager.clearAll()
            assert.strictEqual(queueManager.isAnimating(filePath), false)
        })

        it('should clear specific file queue', () => {
            const filePath = '/test/file.ts'
            queueManager.markAsAnimating(filePath)
            assert.strictEqual(queueManager.isAnimating(filePath), true)

            queueManager.clearFileQueue(filePath)
            assert.strictEqual(queueManager.isAnimating(filePath), false)
        })
    })
})
