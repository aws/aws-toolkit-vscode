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
        getLogger().info(`[DiffAnimationHandler] 🚀 Initializing DiffAnimationHandler with streaming-only approach`)

        // Initialize components
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

        // Check if we have a pending write for this file
        const pendingWrite = this.pendingWrites.get(filePath)
        if (!pendingWrite) {
            return
        }

        // CRITICAL FIX: Check if streaming is active for this toolUseId
        // If streaming is active, let the streaming system handle it entirely
        if (this.isStreamingActive(pendingWrite.toolUseId)) {
            getLogger().info(
                `[DiffAnimationHandler] 🌊 Streaming is active for ${pendingWrite.toolUseId}, skipping post-write animation`
            )
            // Remove from pending writes but don't start animation
            this.pendingWrites.delete(filePath)
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

                // Store animation data for later static diff view
                this.diffAnimationController.storeAnimationData(filePath, pendingWrite.originalContent, newContent)

                getLogger().info(`[DiffAnimationHandler] ✅ Animation data stored for future diff view`)
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

            // **CRITICAL FIX: Handle chat clicks differently - show static diff view**
            if (params.isFromChatClick) {
                getLogger().info(`[DiffAnimationHandler] 👆 File clicked from chat - showing static diff view`)

                // For chat clicks, always show the static diff view using VSCode's built-in diff
                await this.showStaticDiffForFile(filePath, originalContent, newContent)
                return
            }

            // For non-chat clicks, use the animation system
            if (originalContent !== newContent) {
                getLogger().info(`[DiffAnimationHandler] ✨ Content differs, starting diff animation`)

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
        getLogger().info(`[DiffAnimationHandler] 👆 File clicked from chat: ${filePath}`)

        // Normalize the file path
        const normalizedPath = await this.fileSystemManager.normalizeFilePath(filePath)

        // Get animation data if it exists
        const animation = this.diffAnimationController.getAnimationData(normalizedPath)

        // **CRITICAL FIX: Prioritize animation data over notification parameters**
        // The notification parameters are often incorrect (same content for both original and new)
        // Animation data contains the actual original content from when streaming started
        let origContent: string | undefined
        let newContentToUse: string | undefined

        if (animation) {
            // Use animation data first (most reliable)
            origContent = animation.originalContent
            newContentToUse = animation.newContent
            getLogger().info(
                `[DiffAnimationHandler] Using animation data - original: ${origContent?.length || 0} chars, new: ${newContentToUse?.length || 0} chars`
            )
        } else {
            // Fall back to provided parameters
            origContent = originalContent
            newContentToUse = newContent
            getLogger().info(
                `[DiffAnimationHandler] Using provided parameters - original: ${origContent?.length || 0} chars, new: ${newContentToUse?.length || 0} chars`
            )
        }

        // **ADDITIONAL FIX: If still identical, try reading the actual file from disk**
        if (origContent === newContentToUse && origContent !== undefined) {
            getLogger().warn(`[DiffAnimationHandler] Content is identical, trying to read actual file from disk`)
            try {
                const fileUri = vscode.Uri.file(normalizedPath)
                const doc = await vscode.workspace.openTextDocument(fileUri)
                const actualFileContent = doc.getText()

                if (actualFileContent !== origContent) {
                    newContentToUse = actualFileContent
                    getLogger().info(
                        `[DiffAnimationHandler] Found different content on disk: ${actualFileContent.length} chars vs ${origContent.length} chars`
                    )
                } else {
                    getLogger().warn(`[DiffAnimationHandler] File content on disk is also identical to original`)
                }
            } catch (error) {
                getLogger().error(`[DiffAnimationHandler] Failed to read file from disk: ${error}`)
            }
        }

        if (origContent !== undefined && newContentToUse !== undefined && origContent !== newContentToUse) {
            // Show VS Code's built-in diff view
            await this.diffAnimationController.showVSCodeDiff(normalizedPath, origContent, newContentToUse)
        } else {
            // If no meaningful diff available, just open the file
            getLogger().warn(`[DiffAnimationHandler] No meaningful diff available, opening file normally`)
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
            // Use original content that was already captured by ChatProcessor
            let originalContent = ''

            // Find the pending write that contains the correct original content
            const pendingWrite = Array.from(this.pendingWrites.values()).find(
                (write) => write.toolUseId === toolUseId && write.filePath === filePath
            )

            if (pendingWrite) {
                originalContent = pendingWrite.originalContent
                getLogger().info(
                    `[DiffAnimationHandler] ✅ Using pre-captured original content: ${originalContent.length} chars`
                )
            } else {
                // Fallback: try to read file if no pending write found
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
                    originalContent = document.getText()
                    getLogger().warn(
                        `[DiffAnimationHandler] ⚠️ Fallback: Reading current file content: ${originalContent.length} chars`
                    )
                } catch {
                    originalContent = ''
                    getLogger().info(`[DiffAnimationHandler] 🆕 File doesn't exist, original content is empty`)
                }
            }

            // Store the streaming session
            this.streamingSessions.set(toolUseId, {
                toolUseId,
                filePath,
                originalContent,
                startTime: Date.now(),
            })

            // Open the streaming diff view with the correctly captured original content
            await this.streamingDiffController.openStreamingDiffView(toolUseId, filePath, originalContent)

            getLogger().info(`[DiffAnimationHandler] ✅ Streaming diff session started for ${toolUseId}`)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to start streaming session for ${toolUseId}: ${error}`)
        }
    }

    /**
     * Start streaming diff session with pre-captured original content
     * (called from messages.ts when first streaming chunk arrives)
     */
    public async startStreamingWithOriginalContent(
        toolUseId: string,
        filePath: string,
        originalContent: string
    ): Promise<void> {
        getLogger().info(
            `[DiffAnimationHandler] 🎬 Starting streaming diff session with original content for ${toolUseId} at ${filePath}`
        )

        try {
            // Store the streaming session with the provided original content
            this.streamingSessions.set(toolUseId, {
                toolUseId,
                filePath,
                originalContent,
                startTime: Date.now(),
            })

            // Open the streaming diff view with the provided original content
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

        // **CRITICAL FIX: Don't process empty content unless it's the final chunk**
        // This prevents the streaming diff controller from replacing file content with empty string
        // But we still want to allow the streaming session to be active for animation setup
        if (!isFinal && partialContent.trim() === '') {
            getLogger().debug(
                `[DiffAnimationHandler] ⏳ Skipping empty content chunk for ${toolUseId} - waiting for actual content (session remains active)`
            )
            return
        }

        getLogger().info(
            `[DiffAnimationHandler] ⚡ Streaming content update for ${toolUseId}: ${partialContent.length} chars (final: ${isFinal})`
        )

        try {
            // Stream the content to the diff view
            await this.streamingDiffController.streamContentUpdate(toolUseId, partialContent, isFinal)

            if (isFinal) {
                // **CRITICAL FIX: Store animation data when streaming completes**
                // This ensures we have the original and final content for static diff view later
                getLogger().info(`[DiffAnimationHandler] 📦 Storing animation data for future static diff view`)

                // Create animation data to store for later diff view clicks
                const animationData = {
                    uri: vscode.Uri.file(session.filePath),
                    originalContent: session.originalContent,
                    newContent: partialContent,
                    isShowingStaticDiff: false,
                    animationCancelled: false,
                    isFromChatClick: false,
                }

                // Store in diffAnimationController for later retrieval using proper method
                // Access the private activeAnimations map through bracket notation since it's private
                ;(this.diffAnimationController as any).activeAnimations.set(session.filePath, animationData)

                getLogger().info(
                    `[DiffAnimationHandler] ✅ Animation data stored - original: ${session.originalContent.length} chars, final: ${partialContent.length} chars`
                )

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

    public async dispose(): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 💥 Disposing DiffAnimationHandler`)

        // Clear all tracking sets and maps
        this.pendingWrites.clear()
        this.streamingSessions.clear()

        // Dispose components
        this.diffAnimationController.dispose()
        this.fileSystemManager.dispose()
        this.streamingDiffController.dispose()
        this.chatProcessor.clearAll()
    }
}
