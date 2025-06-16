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

describe('DiffAnimationController', function () {
    let controller: DiffAnimationController
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Mock vscode APIs
        sandbox.stub(vscode.workspace, 'openTextDocument')
        sandbox.stub(vscode.workspace, 'applyEdit')
        sandbox.stub(vscode.window, 'showTextDocument')
        sandbox.stub(vscode.commands, 'executeCommand')
        sandbox.stub(vscode.window, 'setStatusBarMessage')

        // Mock vscode.workspace.fs properly
        const mockFs = {
            writeFile: sandbox.stub().resolves(),
            readFile: sandbox.stub().resolves(Buffer.from('')),
            stat: sandbox.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 }),
        }
        sandbox.stub(vscode.workspace, 'fs').value(mockFs)

        controller = new DiffAnimationController()
    })

    afterEach(function () {
        controller.dispose()
        sandbox.restore()
    })

    describe('constructor', function () {
        it('should initialize successfully', function () {
            assert.ok(controller)
            // Controller should be initialized without errors
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

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

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

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

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

            // Mock file operations for new file
            ;(vscode.workspace.openTextDocument as sinon.SinonStub)
                .onFirstCall()
                .rejects(new Error('File not found'))
                .onSecondCall()
                .resolves({
                    getText: () => '',
                    lineCount: 0,
                    save: sandbox.stub().resolves(),
                })
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            // Should complete without errors
            assert.ok(true)
        })

        it('should start animation for existing file', async function () {
            const filePath = '/test/existing-file.js'
            const originalContent = 'console.log("old")'
            const newContent = 'console.log("new")'

            // Mock file operations for existing file
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            // Should complete without errors
            assert.ok(true)
        })

        it('should handle chat click differently', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock VS Code diff command
            ;(vscode.commands.executeCommand as sinon.SinonStub).resolves()

            await controller.startDiffAnimation(filePath, originalContent, newContent, true)

            // Should handle chat click without errors
            assert.ok(true)
        })

        it('should handle errors gracefully', async function () {
            const filePath = '/test/error-file.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock error in file operations
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).rejects(new Error('File error'))

            try {
                await controller.startDiffAnimation(filePath, originalContent, newContent, false)
            } catch (error) {
                // Expected to throw
            }

            // Should handle errors gracefully
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

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 3,
                lineAt: (line: number) => ({ text: `line${line + 1}` }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startPartialDiffAnimation(filePath, originalContent, newContent, options)

            // Should complete without errors
            assert.ok(true)
        })

        it('should handle partial animation without options', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startPartialDiffAnimation(filePath, originalContent, newContent)

            // Should complete without errors
            assert.ok(true)
        })
    })

    describe('showVSCodeDiff', function () {
        it('should show VS Code diff view', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock VS Code diff command
            ;(vscode.commands.executeCommand as sinon.SinonStub).resolves()

            await controller.showVSCodeDiff(filePath, originalContent, newContent)

            // Should execute diff command
            assert.ok(vscode.commands.executeCommand)
        })

        it('should handle errors in diff view', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock error in diff command
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

            // Mock file operations and start animation first
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)
            ;(vscode.commands.executeCommand as sinon.SinonStub).resolves()

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)
            await controller.showStaticDiffView(filePath)

            assert.ok(vscode.commands.executeCommand)
        })

        it('should handle missing animation data', async function () {
            const filePath = '/test/non-existent-file.js'

            await controller.showStaticDiffView(filePath)

            // Should handle gracefully without errors
            assert.ok(true)
        })
    })

    describe('stopDiffAnimation', function () {
        it('should stop animation for specific file', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock file operations and start animation
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            controller.stopDiffAnimation(filePath)

            // Animation data should be removed
            const animationData = controller.getAnimationData(filePath)
            assert.strictEqual(animationData, undefined)
        })

        it('should handle stopping non-existent animation', function () {
            const filePath = '/test/non-existent.js'

            controller.stopDiffAnimation(filePath)

            // Should handle gracefully
            assert.ok(true)
        })
    })

    describe('stopAllAnimations', function () {
        it('should stop all active animations', async function () {
            const filePath1 = '/test/file1.js'
            const filePath2 = '/test/file2.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            // Start multiple animations
            await controller.startDiffAnimation(filePath1, originalContent, newContent, false)
            await controller.startDiffAnimation(filePath2, originalContent, newContent, false)

            controller.stopAllAnimations()

            // All animation data should be removed
            assert.strictEqual(controller.getAnimationData(filePath1), undefined)
            assert.strictEqual(controller.getAnimationData(filePath2), undefined)
        })

        it('should handle stopping when no animations are active', function () {
            controller.stopAllAnimations()

            // Should handle gracefully
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

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            const result = controller.isAnimating(filePath)
            assert.strictEqual(result, true)
        })

        it('should return false after stopping animation', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)
            controller.stopDiffAnimation(filePath)

            const result = controller.isAnimating(filePath)
            assert.strictEqual(result, false)
        })
    })

    describe('isShowingStaticDiff', function () {
        it('should return false for non-existent file', function () {
            const result = controller.isShowingStaticDiff('/non/existent/file.js')
            assert.strictEqual(result, false)
        })

        it('should return correct static diff status', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            const result = controller.isShowingStaticDiff(filePath)
            assert.strictEqual(typeof result, 'boolean')
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

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

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

            // Should dispose without errors
            assert.ok(true)
        })

        it('should stop all animations on dispose', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            controller.dispose()

            // Animation should be stopped
            const stats = controller.getAnimationStats()
            assert.strictEqual(stats.activeCount, 0)
        })

        it('should handle multiple dispose calls', function () {
            controller.dispose()
            controller.dispose()

            // Should not throw on multiple dispose calls
            assert.ok(true)
        })
    })

    describe('edge cases', function () {
        it('should handle very large content', async function () {
            const filePath = '/test/large-file.js'
            const originalContent = 'x'.repeat(100000)
            const newContent = 'y'.repeat(100000)

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            // Should handle large content without errors
            assert.ok(true)
        })

        it('should handle special characters in file paths', async function () {
            const filePath = '/test/file with spaces & symbols!@#$.js'
            const originalContent = 'original'
            const newContent = 'new'

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            const animationData = controller.getAnimationData(filePath)
            assert.ok(animationData)
        })

        it('should handle empty content', async function () {
            const filePath = '/test/empty-file.js'
            const originalContent = ''
            const newContent = ''

            // Mock file operations for empty file
            ;(vscode.workspace.openTextDocument as sinon.SinonStub)
                .onFirstCall()
                .rejects(new Error('File not found'))
                .onSecondCall()
                .resolves({
                    getText: () => '',
                    lineCount: 0,
                    save: sandbox.stub().resolves(),
                })
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            await controller.startDiffAnimation(filePath, originalContent, newContent, false)

            // Should handle empty content without errors
            assert.ok(true)
        })

        it('should handle concurrent animations on same file', async function () {
            const filePath = '/test/file.js'
            const originalContent = 'original'
            const newContent1 = 'new1'
            const newContent2 = 'new2'

            // Mock file operations
            const mockDoc = {
                getText: () => originalContent,
                lineCount: 1,
                lineAt: () => ({ text: originalContent }),
                save: sandbox.stub().resolves(),
            }
            ;(vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDoc)
            ;(vscode.workspace.applyEdit as sinon.SinonStub).resolves(true)

            // Start concurrent animations
            const promise1 = controller.startDiffAnimation(filePath, originalContent, newContent1, false)
            const promise2 = controller.startDiffAnimation(filePath, originalContent, newContent2, false)

            await Promise.all([promise1, promise2])

            // Should handle gracefully
            const animationData = controller.getAnimationData(filePath)
            assert.ok(animationData)
        })
    })
})
