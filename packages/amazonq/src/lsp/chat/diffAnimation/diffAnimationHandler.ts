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
import { DiffAnimationController, PartialUpdateOptions } from './diffAnimationController'
import { FileSystemManager } from './fileSystemManager'
import { ChatProcessor } from './chatProcessor'
import { AnimationQueueManager } from './animationQueueManager'
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
    private animationQueueManager: AnimationQueueManager
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
        getLogger().info(`[DiffAnimationHandler] 🚀 Initializing DiffAnimationHandler with Cline-style diff view`)

        // Initialize components
        this.diffAnimationController = new DiffAnimationController()
        this.fileSystemManager = new FileSystemManager(this.handleFileChange.bind(this))
        this.chatProcessor = new ChatProcessor(this.fileSystemManager, this.handleFileWritePreparation.bind(this))
        this.animationQueueManager = new AnimationQueueManager(
            this.fileSystemManager,
            this.animateFileChangeWithDiff.bind(this),
            this.animatePartialFileChange.bind(this)
        )
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
        getLogger().info(`[DiffAnimationHandler] 🧪 Running test animation for: ${testFilePath}`)

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

    /**
     * Handle file write preparation callback
     */
    private async handleFileWritePreparation(pendingWrite: PendingFileWrite): Promise<void> {
        // Check if we already have a pending write for this file
        if (this.pendingWrites.has(pendingWrite.filePath)) {
            getLogger().warn(
                `[DiffAnimationHandler] ⚠️ Already have pending write for ${pendingWrite.filePath}, skipping`
            )
            return
        }

        // Store the pending write
        this.pendingWrites.set(pendingWrite.filePath, pendingWrite)
        getLogger().info(`[DiffAnimationHandler] 📝 Stored pending write for: ${pendingWrite.filePath}`)
    }

    /**
     * Handle file changes - this is where we detect the actual write
     */
    private async handleFileChange(uri: vscode.Uri): Promise<void> {
        const filePath = uri.fsPath

        // Skip if we're currently animating this file
        if (this.animationQueueManager.isAnimating(filePath)) {
            return
        }

        // Check if we have a pending write for this file
        const pendingWrite = this.pendingWrites.get(filePath)
        if (!pendingWrite) {
            return
        }

        // Remove from pending writes
        this.pendingWrites.delete(filePath)

        getLogger().info(`[DiffAnimationHandler] 📝 Detected file write: ${filePath}`)

        // Small delay to ensure the write is complete
        await new Promise((resolve) => setTimeout(resolve, 50))

        try {
            // Read the new content that was just written
            const newContent = await this.fileSystemManager.getCurrentFileContent(filePath)

            // Check if content actually changed
            if (pendingWrite.originalContent !== newContent) {
                getLogger().info(
                    `[DiffAnimationHandler] 🎬 Content changed - ` +
                        `original: ${pendingWrite.originalContent.length} chars, new: ${newContent.length} chars`
                )

                // Start animation using the queue manager
                await this.animationQueueManager.startAnimation(filePath, pendingWrite, newContent)
            } else {
                getLogger().info(`[DiffAnimationHandler] ℹ️ No content change for: ${filePath}`)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process file change: ${error}`)
        }
    }

    /**
     * Check if we should show static diff for a file
     */
    public shouldShowStaticDiff(filePath: string, content: string): boolean {
        // Always show static diff when called from chat click
        // This method is primarily called when user clicks on file tabs in chat
        const animation = this.diffAnimationController.getAnimationData(filePath)

        // If we have animation data, we should show static diff
        if (animation) {
            return true
        }

        // Check if the file has been animated before
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

        getLogger().info(`[DiffAnimationHandler] 🎬 Starting Cline-style diff animation ${animationId}`)
        getLogger().info(
            `[DiffAnimationHandler] 📊 Animation details: from ${originalContent.length} chars to ${newContent.length} chars`
        )

        try {
            // Show a status message
            vscode.window.setStatusBarMessage(`🎬 Showing changes for ${path.basename(filePath)}...`, 5000)

            // Use the DiffAnimationController with Cline-style diff view
            await this.diffAnimationController.startDiffAnimation(filePath, originalContent, newContent, false)

            getLogger().info(`[DiffAnimationHandler] ✅ Animation started successfully`)

            // Show completion message
            vscode.window.setStatusBarMessage(`✅ Showing changes for ${path.basename(filePath)}`, 3000)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to animate ${animationId}: ${error}`)
        } finally {
            getLogger().info(`[DiffAnimationHandler] 🏁 Animation ${animationId} completed`)
        }
    }

    /**
     * Animate only the changed portion of the file
     */
    private async animatePartialFileChange(
        filePath: string,
        originalContent: string,
        newContent: string,
        changeLocation: { startLine: number; endLine: number },
        toolUseId: string
    ): Promise<void> {
        const animationId = `${path.basename(filePath)}_partial_${Date.now()}`

        getLogger().info(
            `[DiffAnimationHandler] 🎬 Starting partial diff animation ${animationId} at lines ${changeLocation.startLine}-${changeLocation.endLine}`
        )

        try {
            // Show a status message
            vscode.window.setStatusBarMessage(
                `🎬 Showing changes for ${path.basename(filePath)} (lines ${changeLocation.startLine}-${changeLocation.endLine})...`,
                5000
            )

            // Use the enhanced partial update method
            await this.diffAnimationController.startPartialDiffAnimation(filePath, originalContent, newContent, {
                changeLocation,
                isPartialUpdate: true,
            } as PartialUpdateOptions)

            getLogger().info(`[DiffAnimationHandler] ✅ Partial animation completed successfully`)

            // Show completion message
            vscode.window.setStatusBarMessage(`✅ Updated ${path.basename(filePath)}`, 3000)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to animate ${animationId}: ${error}`)
            // Fall back to full animation
            await this.animateFileChangeWithDiff(filePath, originalContent, newContent, toolUseId)
        } finally {
            getLogger().info(`[DiffAnimationHandler] 🏁 Animation ${animationId} completed`)
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
        getLogger().info(`[DiffAnimationHandler] 🎨 Processing file diff for: ${params.originalFileUri}`)

        try {
            const filePath = await this.fileSystemManager.normalizeFilePath(params.originalFileUri)
            const originalContent = params.originalFileContent || ''
            const newContent = params.fileContent || ''

            if (originalContent !== newContent || !params.isFromChatClick) {
                getLogger().info(
                    `[DiffAnimationHandler] ✨ Content differs or not from chat click, starting diff animation`
                )

                // Pass the isFromChatClick flag to the controller
                await this.diffAnimationController.startDiffAnimation(
                    filePath,
                    originalContent,
                    newContent,
                    params.isFromChatClick || false
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
        getLogger().info(`[DiffAnimationHandler] 👆 File clicked from chat: ${filePath}`)

        // Normalize the file path
        const normalizedPath = await this.fileSystemManager.normalizeFilePath(filePath)

        // Get animation data if it exists
        const animation = this.diffAnimationController.getAnimationData(normalizedPath)

        // Use provided content or animation data
        const origContent = originalContent || animation?.originalContent
        const newContentToUse = newContent || animation?.newContent

        if (origContent !== undefined && newContentToUse !== undefined) {
            // Show VS Code's built-in diff view
            await this.diffAnimationController.showVSCodeDiff(normalizedPath, origContent, newContentToUse)
        } else {
            // If no content available, just open the file
            getLogger().warn(`[DiffAnimationHandler] No diff content available, opening file normally`)
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(normalizedPath))
            await vscode.window.showTextDocument(doc)
        }
    }

    /**
     * Start streaming diff session for a tool use (called when fsWrite/fsReplace is detected)
     */
    public async startStreamingDiffSession(toolUseId: string, filePath: string): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 🎬 Starting streaming diff session for ${toolUseId} at ${filePath}`)

        try {
            // Read original content before any changes
            const originalContent = await this.fileSystemManager.getCurrentFileContent(filePath).catch(() => '')

            // Store the streaming session
            this.streamingSessions.set(toolUseId, {
                toolUseId,
                filePath,
                originalContent,
                startTime: Date.now(),
            })

            // Open the streaming diff view immediately
            await this.streamingDiffController.openStreamingDiffView(toolUseId, filePath, originalContent)

            getLogger().info(`[DiffAnimationHandler] ✅ Streaming diff session started for ${toolUseId}`)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to start streaming session for ${toolUseId}: ${error}`)
        }
    }

    /**
     * Stream content updates to the diff view (called from language server)
     */
    public async streamContentUpdate(
        toolUseId: string,
        partialContent: string,
        isFinal: boolean = false
    ): Promise<void> {
        const session = this.streamingSessions.get(toolUseId)
        if (!session) {
            getLogger().warn(`[DiffAnimationHandler] ⚠️ No streaming session found for ${toolUseId}`)
            return
        }

        getLogger().info(
            `[DiffAnimationHandler] ⚡ Streaming content update for ${toolUseId}: ${partialContent.length} chars (final: ${isFinal})`
        )

        try {
            // Stream the content to the diff view
            await this.streamingDiffController.streamContentUpdate(toolUseId, partialContent, isFinal)

            if (isFinal) {
                // Calculate session duration
                const duration = Date.now() - session.startTime
                getLogger().info(
                    `[DiffAnimationHandler] 🏁 Streaming session completed for ${toolUseId} in ${duration}ms`
                )

                // Clean up the session
                this.streamingSessions.delete(toolUseId)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to stream content for ${toolUseId}: ${error}`)
        }
    }

    /**
     * Check if a streaming session is active
     */
    public isStreamingActive(toolUseId: string): boolean {
        return this.streamingSessions.has(toolUseId) && this.streamingDiffController.isStreamingActive(toolUseId)
    }

    /**
     * Get streaming statistics for debugging
     */
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

    /**
     * Clear caches for a specific tab
     */
    public clearTabCache(tabId: string): void {
        // Clean up old pending writes
        const cleanedWrites = this.fileSystemManager.cleanupOldPendingWrites(this.pendingWrites)

        // Clear processed messages to prevent memory leak
        this.chatProcessor.clearProcessedMessages()

        if (cleanedWrites > 0) {
            getLogger().info(`[DiffAnimationHandler] 🧹 Cleared ${cleanedWrites} old pending writes`)
        }
    }

    public async dispose(): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 💥 Disposing DiffAnimationHandler`)

        // Clear all tracking sets and maps
        this.pendingWrites.clear()

        // Dispose components
        this.diffAnimationController.dispose()
        this.fileSystemManager.dispose()
        this.animationQueueManager.clearAll()
        this.chatProcessor.clearAll()
    }
}
