/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DiffAnimationHandler - Cline-style Diff View Approach
 *
 * Uses VS Code's built-in diff editor to show animations:
 * 1. When file change detected, open diff view (left: original, right: changes)
 * 2. Stream content line-by-line with yellow highlight animation
 * 3. Show GitHub-style diff decorations after animation completes
 * 4. Properly handles new file creation with empty left panel
 *
 * Benefits:
 * - Deletion animations (red lines) are visible in diff view
 * - Side-by-side comparison shows exactly what's changing
 * - Uses VS Code's native diff viewer
 * - No temp file management needed
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { ChatResult, ChatMessage, ChatUpdateParams } from '@aws/language-server-runtimes/protocol'
import { getLogger } from 'aws-core-vscode/shared'
import { DiffAnimationController } from './diffAnimationController'
import { FileSystemManager } from './fileSystemManager'
import { ChatProcessor } from './chatProcessor'
import { PendingFileWrite } from './types'
import { StreamingDiffController } from './streamingDiffController'

export class DiffAnimationHandler implements vscode.Disposable {
    /**
     * BEHAVIOR SUMMARY:
     *
     * 1. DIFF VIEW APPROACH
     *    - Each file modification opens a diff view
     *    - Left panel shows original content (read-only)
     *    - Right panel shows changes with streaming animation
     *
     * 2. AUTOMATIC DIFF VIEW OPENING
     *    - When a file is about to be modified, capture original content
     *    - When change is detected, open diff view automatically
     *    - Files are animated with line-by-line streaming
     *
     * 3. ANIMATION FLOW
     *    - Detect change in source file
     *    - Open VS Code diff view
     *    - Stream content line by line with yellow highlight
     *    - Apply GitHub-style diff decorations
     *    - Keep diff view open for review
     *
     * This ensures deletion animations always show properly in the diff view!
     */

    private diffAnimationController: DiffAnimationController
    private fileSystemManager: FileSystemManager
    private chatProcessor: ChatProcessor
    private streamingDiffController: StreamingDiffController

    // Track pending file writes by file path
    private pendingWrites = new Map<string, PendingFileWrite>()

    // Track streaming diff sessions by tool use ID
    private streamingSessions = new Map<
        string,
        {
            toolUseId: string
            filePath: string
            originalContent: string
            startTime: number
        }
    >()

    constructor() {
        this.diffAnimationController = new DiffAnimationController()
        this.fileSystemManager = new FileSystemManager(this.handleFileChange.bind(this))
        this.chatProcessor = new ChatProcessor(this.fileSystemManager, this.handleFileWritePreparation.bind(this))
        this.streamingDiffController = new StreamingDiffController()
    }

    /**
     * Test method to manually trigger animation (for debugging)
     */
    public async testAnimation(): Promise<void> {
        const originalContent = `function hello() {
   console.log("Hello World");
   return true;
}`

        const newContent = `function hello(name) {
   console.log(\`Hello \${name}!\`);
   console.log("Welcome to the app");
   return { success: true, name: name };
}`

        const testFilePath = path.join(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.resolve('.'),
            'test_animation.js'
        )

        // Run the animation using Cline-style diff view
        await this.animateFileChangeWithDiff(testFilePath, originalContent, newContent, 'test')
    }

    /**
     * Process streaming ChatResult updates
     */
    public async processChatResult(
        chatResult: ChatResult | ChatMessage,
        tabId: string,
        isPartialResult?: boolean
    ): Promise<void> {
        return this.chatProcessor.processChatResult(chatResult, tabId, isPartialResult)
    }

    /**
     * Process ChatUpdateParams
     */
    public async processChatUpdate(params: ChatUpdateParams): Promise<void> {
        return this.chatProcessor.processChatUpdate(params)
    }

    private async handleFileWritePreparation(pendingWrite: PendingFileWrite): Promise<void> {
        if (this.pendingWrites.has(pendingWrite.filePath)) {
            return
        }
        this.pendingWrites.set(pendingWrite.filePath, pendingWrite)
    }

    private async handleFileChange(uri: vscode.Uri): Promise<void> {
        const filePath = uri.fsPath
        const pendingWrite = this.pendingWrites.get(filePath)
        if (!pendingWrite) {
            return
        }

        if (this.isStreamingActive(pendingWrite.toolUseId)) {
            this.pendingWrites.delete(filePath)
            return
        }

        this.pendingWrites.delete(filePath)
        await new Promise((resolve) => setTimeout(resolve, 50))
    }

    public shouldShowStaticDiff(filePath: string, content: string): boolean {
        const animation = this.diffAnimationController.getAnimationData(filePath)
        if (animation) {
            return true
        }
        return this.diffAnimationController.shouldShowStaticDiff(filePath, content)
    }

    /**
     * Animate file changes using Cline-style diff view
     */
    private async animateFileChangeWithDiff(
        filePath: string,
        originalContent: string,
        newContent: string,
        toolUseId: string
    ): Promise<void> {
        const animationId = `${path.basename(filePath)}_${Date.now()}`

        try {
            // Show a status message
            vscode.window.setStatusBarMessage(`🎬 Showing changes for ${path.basename(filePath)}...`, 5000)

            // Use the DiffAnimationController with Cline-style diff view
            await this.diffAnimationController.startDiffAnimation(filePath, originalContent, newContent, false)

            // Show completion message
            vscode.window.setStatusBarMessage(`✅ Showing changes for ${path.basename(filePath)}`, 3000)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to animate ${animationId}: ${error}`)
        }
    }

    /**
     * Process file diff parameters directly (for backwards compatibility)
     */
    public async processFileDiff(params: {
        originalFileUri: string
        originalFileContent?: string
        fileContent?: string
        isFromChatClick?: boolean
    }): Promise<void> {
        try {
            const filePath = await this.fileSystemManager.normalizeFilePath(params.originalFileUri)
            const originalContent = params.originalFileContent || ''
            const newContent = params.fileContent || ''

            if (params.isFromChatClick) {
                await this.showStaticDiffForFile(filePath, originalContent, newContent)
                return
            }
            if (originalContent !== newContent) {
                await this.diffAnimationController.startDiffAnimation(
                    filePath,
                    originalContent,
                    newContent,
                    false // Not from chat click, so use animation
                )
            } else {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Original and new content are identical`)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process file diff: ${error}`)
        }
    }

    /**
     * Show static diff view for a file (when clicked from chat)
     */
    public async showStaticDiffForFile(filePath: string, originalContent?: string, newContent?: string): Promise<void> {
        // Normalize the file path
        const normalizedPath = await this.fileSystemManager.normalizeFilePath(filePath)

        // Get animation data if it exists
        const animation = this.diffAnimationController.getAnimationData(normalizedPath)

        let origContent: string | undefined
        let newContentToUse: string | undefined

        if (animation) {
            origContent = animation.originalContent
            newContentToUse = animation.newContent
        } else {
            origContent = originalContent
            newContentToUse = newContent
        }

        if (origContent === newContentToUse && origContent !== undefined) {
            try {
                const fileUri = vscode.Uri.file(normalizedPath)
                const doc = await vscode.workspace.openTextDocument(fileUri)
                const actualFileContent = doc.getText()
                if (actualFileContent !== origContent) {
                    newContentToUse = actualFileContent
                }
            } catch (error) {
                getLogger().error(`[DiffAnimationHandler] Failed to read file from disk: ${error}`)
            }
        }

        if (origContent !== undefined && newContentToUse !== undefined && origContent !== newContentToUse) {
            await this.diffAnimationController.showVSCodeDiff(normalizedPath, origContent, newContentToUse)
        } else {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(normalizedPath))
            await vscode.window.showTextDocument(doc)
        }
    }

    public async startStreamingDiffSession(
        toolUseId: string,
        filePath: string,
        providedOriginalContent?: string
    ): Promise<void> {
        try {
            let originalContent = providedOriginalContent || ''

            if (!providedOriginalContent) {
                const pendingWrite = Array.from(this.pendingWrites.values()).find(
                    (write) => write.toolUseId === toolUseId && write.filePath === filePath
                )

                if (pendingWrite) {
                    originalContent = pendingWrite.originalContent
                } else {
                    try {
                        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
                        originalContent = document.getText()
                    } catch {
                        originalContent = ''
                    }
                }
            }

            this.streamingSessions.set(toolUseId, {
                toolUseId,
                filePath,
                originalContent,
                startTime: Date.now(),
            })

            await this.streamingDiffController.openStreamingDiffView(toolUseId, filePath, originalContent)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to start streaming session for ${toolUseId}: ${error}`)
        }
    }

    public async startStreamingWithOriginalContent(
        toolUseId: string,
        filePath: string,
        originalContent: string
    ): Promise<void> {
        return this.startStreamingDiffSession(toolUseId, filePath, originalContent)
    }

    public async streamContentUpdate(
        toolUseId: string,
        partialContent: string,
        isFinal: boolean = false
    ): Promise<void> {
        const session = this.streamingSessions.get(toolUseId)
        if (!session) {
            return
        }

        if (!isFinal && partialContent.trim() === '') {
            return
        }

        try {
            await this.streamingDiffController.streamContentUpdate(toolUseId, partialContent, isFinal)

            if (isFinal) {
                const animationData = {
                    uri: vscode.Uri.file(session.filePath),
                    originalContent: session.originalContent,
                    newContent: partialContent,
                    isShowingStaticDiff: false,
                    animationCancelled: false,
                    isFromChatClick: false,
                }

                ;(this.diffAnimationController as any).activeAnimations.set(session.filePath, animationData)

                // **CRITICAL FIX**: Proper dispose logic for streaming sessions (same as fsWrite)
                // Clean up the session from diffAnimationHandler when streaming completes
                this.streamingSessions.delete(toolUseId)
                getLogger().info(
                    `[DiffAnimationHandler] 🧹 Cleaned up streaming session for ${toolUseId} after completion`
                )
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to stream content for ${toolUseId}: ${error}`)

            // **CRITICAL FIX**: Clean up session on error to prevent memory leaks
            this.streamingSessions.delete(toolUseId)
            getLogger().warn(`[DiffAnimationHandler] 🧹 Cleaned up streaming session for ${toolUseId} after error`)
        }
    }

    public isStreamingActive(toolUseId: string): boolean {
        return this.streamingSessions.has(toolUseId) && this.streamingDiffController.isStreamingActive(toolUseId)
    }

    public getStreamingStats(toolUseId: string): any {
        const session = this.streamingSessions.get(toolUseId)
        const streamingStats = this.streamingDiffController.getStreamingStats(toolUseId)
        return {
            sessionExists: !!session,
            sessionDuration: session ? Date.now() - session.startTime : 0,
            filePath: session?.filePath,
            ...streamingStats,
        }
    }

    public async dispose(): Promise<void> {
        this.pendingWrites.clear()
        this.streamingSessions.clear()
        this.diffAnimationController.dispose()
        this.fileSystemManager.dispose()
        this.streamingDiffController.dispose()
        this.chatProcessor.clearAll()
    }
}
