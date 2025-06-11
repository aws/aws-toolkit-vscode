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

interface PendingFileWrite {
    filePath: string
    originalContent: string
    toolUseId: string
    timestamp: number
    changeLocation?: {
        startLine: number
        endLine: number
        startChar?: number
        endChar?: number
    }
}

interface QueuedAnimation {
    originalContent: string
    newContent: string
    toolUseId: string
    changeLocation?: {
        startLine: number
        endLine: number
        startChar?: number
        endChar?: number
    }
}

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
    private disposables: vscode.Disposable[] = []

    // Track pending file writes by file path
    private pendingWrites = new Map<string, PendingFileWrite>()
    // Track which files are being animated
    private animatingFiles = new Set<string>()
    // Track processed messages to avoid duplicates
    private processedMessages = new Set<string>()
    // File system watcher
    private fileWatcher: vscode.FileSystemWatcher | undefined
    // Animation queue for handling multiple changes
    private animationQueue = new Map<string, QueuedAnimation[]>()

    constructor() {
        getLogger().info(`[DiffAnimationHandler] 🚀 Initializing DiffAnimationHandler with Cline-style diff view`)
        this.diffAnimationController = new DiffAnimationController()

        // Set up file system watcher for all files
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*')

        // Watch for file changes
        this.fileWatcher.onDidChange(async (uri) => {
            await this.handleFileChange(uri)
        })

        // Watch for file creation
        this.fileWatcher.onDidCreate(async (uri) => {
            await this.handleFileChange(uri)
        })

        this.disposables.push(this.fileWatcher)

        // Also listen to text document changes for more immediate detection
        const changeTextDocumentDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document.uri.scheme !== 'file' || event.contentChanges.length === 0) {
                return
            }

            // Skip if we're currently animating this file
            if (this.animatingFiles.has(event.document.uri.fsPath)) {
                return
            }

            // Check if this is an external change (not from user typing)
            if (event.reason === undefined) {
                await this.handleFileChange(event.document.uri)
            }
        })
        this.disposables.push(changeTextDocumentDisposable)
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
        getLogger().info(
            `[DiffAnimationHandler] 📨 Processing ChatResult for tab ${tabId}, isPartial: ${isPartialResult}`
        )

        try {
            // Handle both ChatResult and ChatMessage types
            if ('type' in chatResult && chatResult.type === 'tool') {
                // This is a ChatMessage
                await this.processChatMessage(chatResult as ChatMessage, tabId)
            } else if ('additionalMessages' in chatResult && chatResult.additionalMessages) {
                // This is a ChatResult with additional messages
                for (const message of chatResult.additionalMessages) {
                    await this.processChatMessage(message, tabId)
                }
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process chat result: ${error}`)
        }
    }

    /**
     * Process individual chat messages
     */
    private async processChatMessage(message: ChatMessage, tabId: string): Promise<void> {
        if (!message.messageId) {
            return
        }

        // Deduplicate messages
        const messageKey = `${message.messageId}_${message.type}`
        if (this.processedMessages.has(messageKey)) {
            getLogger().info(`[DiffAnimationHandler] ⏭️ Already processed message: ${messageKey}`)
            return
        }
        this.processedMessages.add(messageKey)

        // Check for fsWrite tool preparation (when tool is about to execute)
        if (message.type === 'tool' && message.messageId.startsWith('progress_')) {
            await this.processFsWritePreparation(message, tabId)
        }
    }

    /**
     * Process fsWrite preparation - capture content BEFORE file is written
     */
    private async processFsWritePreparation(message: ChatMessage, tabId: string): Promise<void> {
        // Cast to any to access properties that might not be in the type definition
        const messageAny = message as any

        const fileList = messageAny.header?.fileList
        if (!fileList?.filePaths || fileList.filePaths.length === 0) {
            return
        }

        const fileName = fileList.filePaths[0]
        const fileDetails = fileList.details?.[fileName]

        if (!fileDetails?.description) {
            return
        }

        const filePath = await this.resolveFilePath(fileDetails.description)
        if (!filePath) {
            return
        }

        // Extract toolUseId from progress message
        const toolUseId = message.messageId!.replace('progress_', '')

        getLogger().info(`[DiffAnimationHandler] 🎬 Preparing for fsWrite: ${filePath} (toolUse: ${toolUseId})`)

        // Check if we already have a pending write for this file
        if (this.pendingWrites.has(filePath)) {
            getLogger().warn(`[DiffAnimationHandler] ⚠️ Already have pending write for ${filePath}, skipping`)
            return
        }

        // Capture current content IMMEDIATELY before the write happens
        let originalContent = ''
        let fileExists = false

        try {
            const uri = vscode.Uri.file(filePath)
            const document = await vscode.workspace.openTextDocument(uri)
            originalContent = document.getText()
            fileExists = true
            getLogger().info(`[DiffAnimationHandler] 📸 Captured existing content: ${originalContent.length} chars`)
        } catch (error) {
            // File doesn't exist yet
            getLogger().info(`[DiffAnimationHandler] 🆕 File doesn't exist yet: ${filePath}`)
            originalContent = ''
        }

        // Store pending write info
        this.pendingWrites.set(filePath, {
            filePath,
            originalContent,
            toolUseId,
            timestamp: Date.now(),
        })

        // Open/create the file to make it visible
        try {
            const uri = vscode.Uri.file(filePath)

            if (!fileExists) {
                // Create directory if needed
                const directory = path.dirname(filePath)
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(directory))

                // DON'T create the file yet - let the actual write create it
                // This ensures we capture the transition from non-existent to new content
                getLogger().info(
                    `[DiffAnimationHandler] 📁 Directory prepared, file will be created by write operation`
                )
            } else {
                // Open the document (but keep it in background)
                const document = await vscode.workspace.openTextDocument(uri)
                await vscode.window.showTextDocument(document, {
                    preview: false,
                    preserveFocus: true, // Keep focus on current editor
                    viewColumn: vscode.ViewColumn.One, // Open in first column
                })
            }

            getLogger().info(`[DiffAnimationHandler] ✅ File prepared: ${filePath}`)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to prepare file: ${error}`)
            // Clean up on error
            this.pendingWrites.delete(filePath)
        }
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

        // Remove from pending writes
        this.pendingWrites.delete(filePath)

        getLogger().info(`[DiffAnimationHandler] 📝 Detected file write: ${filePath}`)

        // Small delay to ensure the write is complete
        await new Promise((resolve) => setTimeout(resolve, 50))

        try {
            // Read the new content
            const newContentBuffer = await vscode.workspace.fs.readFile(uri)
            const newContent = Buffer.from(newContentBuffer).toString('utf8')

            // Check if content actually changed
            if (pendingWrite.originalContent !== newContent) {
                getLogger().info(
                    `[DiffAnimationHandler] 🎬 Content changed, checking animation status - ` +
                        `original: ${pendingWrite.originalContent.length} chars, new: ${newContent.length} chars`
                )

                // If already animating, queue the change
                if (this.animatingFiles.has(filePath)) {
                    const queue = this.animationQueue.get(filePath) || []
                    queue.push({
                        originalContent: pendingWrite.originalContent,
                        newContent,
                        toolUseId: pendingWrite.toolUseId,
                        changeLocation: pendingWrite.changeLocation,
                    })
                    this.animationQueue.set(filePath, queue)
                    getLogger().info(
                        `[DiffAnimationHandler] 📋 Queued animation for ${filePath} (queue size: ${queue.length})`
                    )
                    return
                }

                // Start animation
                await this.startAnimation(filePath, pendingWrite, newContent)
            } else {
                getLogger().info(`[DiffAnimationHandler] ℹ️ No content change for: ${filePath}`)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process file change: ${error}`)
        }
    }

    /**
     * Start animation and process queue
     */
    private async startAnimation(filePath: string, pendingWrite: PendingFileWrite, newContent: string): Promise<void> {
        // Check if we have change location for partial update
        if (pendingWrite.changeLocation) {
            // Use partial animation for targeted changes
            await this.animatePartialFileChange(
                filePath,
                pendingWrite.originalContent,
                newContent,
                pendingWrite.changeLocation,
                pendingWrite.toolUseId
            )
        } else {
            // Use full file animation
            await this.animateFileChangeWithDiff(
                filePath,
                pendingWrite.originalContent,
                newContent,
                pendingWrite.toolUseId
            )
        }

        // Process queued animations
        await this.processQueuedAnimations(filePath)
    }

    /**
     * Process queued animations for a file
     */
    private async processQueuedAnimations(filePath: string): Promise<void> {
        const queue = this.animationQueue.get(filePath)
        if (!queue || queue.length === 0) {
            return
        }

        const next = queue.shift()
        if (!next) {
            return
        }

        getLogger().info(
            `[DiffAnimationHandler] 🎯 Processing queued animation for ${filePath} (${queue.length} remaining)`
        )

        // Use the current file content as the "original" for the next animation
        const currentContent = await this.getCurrentFileContent(filePath)

        await this.startAnimation(
            filePath,
            {
                filePath,
                originalContent: currentContent,
                toolUseId: next.toolUseId,
                timestamp: Date.now(),
                changeLocation: next.changeLocation,
            },
            next.newContent
        )
    }

    /**
     * Get current file content
     */
    private async getCurrentFileContent(filePath: string): Promise<string> {
        try {
            const uri = vscode.Uri.file(filePath)
            const content = await vscode.workspace.fs.readFile(uri)
            return Buffer.from(content).toString('utf8')
        } catch {
            return ''
        }
    }

    /**
     * Check if we should show static diff for a file
     */
    public shouldShowStaticDiff(filePath: string, content: string): boolean {
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
        if (this.animatingFiles.has(filePath)) {
            getLogger().info(`[DiffAnimationHandler] ⏭️ Already animating: ${filePath}`)
            return
        }

        this.animatingFiles.add(filePath)
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
            this.animatingFiles.delete(filePath)
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
        if (this.animatingFiles.has(filePath)) {
            getLogger().info(`[DiffAnimationHandler] ⏭️ Already animating: ${filePath}`)
            return
        }

        this.animatingFiles.add(filePath)
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
            this.animatingFiles.delete(filePath)
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
            const filePath = await this.normalizeFilePath(params.originalFileUri)
            if (!filePath) {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Could not normalize path for: ${params.originalFileUri}`)
                return
            }

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
    public async showStaticDiffForFile(filePath: string): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 👆 File clicked from chat: ${filePath}`)

        // Normalize the file path
        const normalizedPath = await this.normalizeFilePath(filePath)
        if (!normalizedPath) {
            getLogger().warn(`[DiffAnimationHandler] ⚠️ Could not normalize path for: ${filePath}`)
            return
        }

        // Show static diff view without animation
        await this.diffAnimationController.showStaticDiffView(normalizedPath)
    }

    /**
     * Process ChatUpdateParams
     */
    public async processChatUpdate(params: ChatUpdateParams): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 🔄 Processing chat update for tab ${params.tabId}`)

        if (params.data?.messages) {
            for (const message of params.data.messages) {
                await this.processChatMessage(message, params.tabId)
            }
        }
    }

    /**
     * Resolve file path to absolute path
     */
    private async resolveFilePath(filePath: string): Promise<string | undefined> {
        getLogger().info(`[DiffAnimationHandler] 🔍 Resolving file path: ${filePath}`)

        try {
            // If already absolute, return as is
            if (path.isAbsolute(filePath)) {
                getLogger().info(`[DiffAnimationHandler] ✅ Path is already absolute: ${filePath}`)
                return filePath
            }

            // Try to resolve relative to workspace folders
            const workspaceFolders = vscode.workspace.workspaceFolders
            if (!workspaceFolders || workspaceFolders.length === 0) {
                getLogger().warn('[DiffAnimationHandler] ⚠️ No workspace folders found')
                return filePath
            }

            // Try each workspace folder
            for (const folder of workspaceFolders) {
                const absolutePath = path.join(folder.uri.fsPath, filePath)
                getLogger().info(`[DiffAnimationHandler] 🔍 Trying: ${absolutePath}`)

                try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath))
                    getLogger().info(`[DiffAnimationHandler] ✅ File exists at: ${absolutePath}`)
                    return absolutePath
                } catch {
                    // File doesn't exist in this workspace folder, try next
                }
            }

            // If file doesn't exist yet, return path relative to first workspace
            const defaultPath = path.join(workspaceFolders[0].uri.fsPath, filePath)
            getLogger().info(`[DiffAnimationHandler] 🆕 Using default path for new file: ${defaultPath}`)
            return defaultPath
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Error resolving file path: ${error}`)
            return undefined
        }
    }

    /**
     * Normalize file path from URI or path string
     */
    private async normalizeFilePath(pathOrUri: string): Promise<string> {
        getLogger().info(`[DiffAnimationHandler] 🔧 Normalizing path: ${pathOrUri}`)

        try {
            // Handle file:// protocol
            if (pathOrUri.startsWith('file://')) {
                const fsPath = vscode.Uri.parse(pathOrUri).fsPath
                getLogger().info(`[DiffAnimationHandler] ✅ Converted file:// URI to: ${fsPath}`)
                return fsPath
            }

            // Check if it's already a file path
            if (path.isAbsolute(pathOrUri)) {
                getLogger().info(`[DiffAnimationHandler] ✅ Already absolute path: ${pathOrUri}`)
                return pathOrUri
            }

            // Try to parse as URI
            try {
                const uri = vscode.Uri.parse(pathOrUri)
                if (uri.scheme === 'file') {
                    getLogger().info(`[DiffAnimationHandler] ✅ Parsed as file URI: ${uri.fsPath}`)
                    return uri.fsPath
                }
            } catch {
                // Not a valid URI, treat as path
            }

            // Return as-is if we can't normalize
            getLogger().info(`[DiffAnimationHandler] ⚠️ Using as-is: ${pathOrUri}`)
            return pathOrUri
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Error normalizing file path: ${error}`)
            return pathOrUri
        }
    }

    /**
     * Clear caches for a specific tab
     */
    public clearTabCache(tabId: string): void {
        // Clean up old pending writes (older than 5 minutes)
        const now = Date.now()
        const timeout = 5 * 60 * 1000 // 5 minutes

        let cleanedWrites = 0
        for (const [filePath, write] of this.pendingWrites) {
            if (now - write.timestamp > timeout) {
                this.pendingWrites.delete(filePath)
                cleanedWrites++
            }
        }

        // Clear processed messages to prevent memory leak
        if (this.processedMessages.size > 1000) {
            const oldSize = this.processedMessages.size
            this.processedMessages.clear()
            getLogger().info(`[DiffAnimationHandler] 🧹 Cleared ${oldSize} processed messages`)
        }

        if (cleanedWrites > 0) {
            getLogger().info(`[DiffAnimationHandler] 🧹 Cleared ${cleanedWrites} old pending writes`)
        }
    }

    public async dispose(): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 💥 Disposing DiffAnimationHandler`)

        // Clear all tracking sets and maps
        this.pendingWrites.clear()
        this.processedMessages.clear()
        this.animatingFiles.clear()
        this.animationQueue.clear()

        // Dispose the diff animation controller
        this.diffAnimationController.dispose()

        if (this.fileWatcher) {
            this.fileWatcher.dispose()
        }

        // Dispose all event listeners
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
