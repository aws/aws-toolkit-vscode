/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { ChatResult, ChatMessage, ChatUpdateParams } from '@aws/language-server-runtimes/protocol'
import { getLogger } from 'aws-core-vscode/shared'
import { DiffAnimationController } from './diffAnimationController'

interface FileChangeInfo {
    filePath: string
    fileName: string
    originalContent?: string
    newContent?: string
    messageId: string
    changes?: {
        added?: number
        deleted?: number
    }
}

interface AnimationTask {
    filePath: string
    fileName: string
    fileDetails: any
    messageId: string
    resolve: () => void
    reject: (error: any) => void
}

export class DiffAnimationHandler implements vscode.Disposable {
    private diffAnimationController: DiffAnimationController
    private fileChangeCache = new Map<string, FileChangeInfo>()
    // Store diff content by toolUseId
    private diffContentMap = new Map<string, { originalContent?: string; newContent?: string; filePath?: string }>()
    // Add a new cache to store the original content of files
    private fileOriginalContentCache = new Map<string, string>()
    private disposables: vscode.Disposable[] = []

    // Animation queue to prevent conflicts
    private animationQueue: AnimationTask[] = []
    private isProcessingAnimation = false
    // Track files currently being animated
    private animatingFiles = new Set<string>()
    // Track processed message IDs to avoid duplicates
    private processedMessages = new Set<string>()

    // Track active files for real-time processing
    private activeFiles = new Map<
        string,
        {
            editor: vscode.TextEditor
            originalContent: string
            currentContent: string
            toolUseId: string
        }
    >()

    constructor() {
        getLogger().info(`[DiffAnimationHandler] 🚀 Initializing DiffAnimationHandler`)
        this.diffAnimationController = new DiffAnimationController()

        // Listen to file open events and cache original content
        const openTextDocumentDisposable = vscode.workspace.onDidOpenTextDocument((document) => {
            const filePath = document.uri.fsPath
            if (!this.fileOriginalContentCache.has(filePath) && document.uri.scheme === 'file') {
                getLogger().info(`[DiffAnimationHandler] 📄 Caching original content for: ${filePath}`)
                this.fileOriginalContentCache.set(filePath, document.getText())
            }
        })
        this.disposables.push(openTextDocumentDisposable)

        // Listen to file change events
        const changeTextDocumentDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document.uri.scheme !== 'file') {
                return
            }

            const filePath = event.document.uri.fsPath
            getLogger().info(`[DiffAnimationHandler] 📝 File change detected: ${filePath}`)

            // Skip if file is currently being animated
            if (this.animatingFiles.has(filePath)) {
                getLogger().info(`[DiffAnimationHandler] ⏭️ Skipping change event for animating file: ${filePath}`)
                return
            }

            const currentContent = event.document.getText()

            // Check if we have cached original content
            const originalContent = this.fileOriginalContentCache.get(filePath)
            if (
                originalContent !== undefined &&
                originalContent !== currentContent &&
                event.contentChanges.length > 0
            ) {
                getLogger().info(`[DiffAnimationHandler] 🔄 Detected change in file: ${filePath}`)
                // Update diff content mapping
                this.diffContentMap.set(filePath, {
                    originalContent: originalContent,
                    newContent: currentContent,
                    filePath: filePath,
                })
            }
        })
        this.disposables.push(changeTextDocumentDisposable)
    }

    /**
     * Process streaming ChatResult updates - supports real-time animation
     */
    public async processChatResult(chatResult: ChatResult, tabId: string, isPartialResult?: boolean): Promise<void> {
        getLogger().info(
            `[DiffAnimationHandler] 📨 Processing ChatResult for tab ${tabId}, isPartial: ${isPartialResult}`
        )
        getLogger().info(
            `[DiffAnimationHandler] 📊 ChatResult details: messageId=${chatResult.messageId}, additionalMessagesCount=${chatResult.additionalMessages?.length || 0}`
        )

        try {
            // Always process additional messages
            if (chatResult.additionalMessages) {
                getLogger().info(
                    `[DiffAnimationHandler] 📋 Processing ${chatResult.additionalMessages.length} additional messages`
                )

                for (const message of chatResult.additionalMessages) {
                    getLogger().info(
                        `[DiffAnimationHandler] 📌 Message: type=${message.type}, messageId=${message.messageId}`
                    )

                    // 1. Process diff content (system-prompt)
                    if (message.type === 'system-prompt' && message.messageId) {
                        await this.processDiffContent(message)
                    }

                    // 2. Process progress messages (progress_) - open file immediately
                    if (message.type === 'tool' && message.messageId?.startsWith('progress_')) {
                        await this.processProgressMessage(message, tabId)
                    }

                    // 3. Process tool completion messages - trigger animation
                    if (
                        message.type === 'tool' &&
                        message.messageId &&
                        !message.messageId.startsWith('progress_') &&
                        message.header?.fileList
                    ) {
                        await this.processToolCompleteMessage(message, tabId)
                    }
                }
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process chat result: ${error}`)
        }
    }

    /**
     * Process ChatUpdateParams for file content updates
     */
    public async processChatUpdate(params: ChatUpdateParams): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 🔄 Processing chat update for tab ${params.tabId}`)

        if (params.data?.messages) {
            // First pass: process all system-prompt messages (diff content)
            for (const message of params.data.messages) {
                if (message.type === 'system-prompt' && message.messageId) {
                    await this.processDiffContent(message)
                }
            }

            // Second pass: process tool messages that might need the diff content
            for (const message of params.data.messages) {
                if (message.type === 'tool' && message.header?.fileList?.filePaths && message.messageId) {
                    await this.processFileListResult(message, params.tabId)
                }
            }
        }
    }

    /**
     * Process file diff parameters directly from openFileDiff notification
     */
    public async processFileDiff(params: {
        originalFileUri: string
        originalFileContent?: string
        fileContent?: string
    }): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 🎨 Processing file diff for: ${params.originalFileUri}`)
        getLogger().info(
            `[DiffAnimationHandler] 📏 Original content length: ${params.originalFileContent?.length || 0}`
        )
        getLogger().info(`[DiffAnimationHandler] 📏 New content length: ${params.fileContent?.length || 0}`)

        try {
            const filePath = await this.normalizeFilePath(params.originalFileUri)
            if (!filePath) {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Could not normalize path for: ${params.originalFileUri}`)
                return
            }

            // Try to open the document first to verify it exists
            try {
                const uri = vscode.Uri.file(filePath)
                await vscode.workspace.openTextDocument(uri)
            } catch (error) {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Could not open file: ${filePath}, creating new file`)
                // Create the directory if it doesn't exist
                const directory = path.dirname(filePath)
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(directory))
            }

            const originalContent = params.originalFileContent || ''
            const newContent = params.fileContent || ''

            if (originalContent !== newContent) {
                getLogger().info(`[DiffAnimationHandler] ✨ Content differs, starting diff animation`)
                await this.diffAnimationController.startDiffAnimation(filePath, originalContent, newContent)
            } else {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Original and new content are identical`)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process file diff: ${error}`)
        }
    }

    /**
     * Process diff content from system-prompt messages
     */
    private async processDiffContent(message: ChatMessage): Promise<void> {
        if (!message.messageId || !message.body) {
            return
        }

        if (message.messageId.endsWith('_original')) {
            const toolUseId = message.messageId.replace('_original', '')
            if (!this.diffContentMap.has(toolUseId)) {
                this.diffContentMap.set(toolUseId, {})
            }
            const diffData = this.diffContentMap.get(toolUseId)!
            diffData.originalContent = message.body
            getLogger().info(
                `[DiffAnimationHandler] ✅ Found original content for ${toolUseId}, length: ${message.body.length}`
            )

            // If we already have new content, trigger animation immediately
            if (diffData.newContent !== undefined) {
                await this.triggerDiffAnimation(toolUseId)
            }
        } else if (message.messageId.endsWith('_new')) {
            const toolUseId = message.messageId.replace('_new', '')
            if (!this.diffContentMap.has(toolUseId)) {
                this.diffContentMap.set(toolUseId, {})
            }
            const diffData = this.diffContentMap.get(toolUseId)!
            diffData.newContent = message.body
            getLogger().info(
                `[DiffAnimationHandler] ✅ Found new content for ${toolUseId}, length: ${message.body.length}`
            )

            // If we already have original content, trigger animation immediately
            if (diffData.originalContent !== undefined) {
                await this.triggerDiffAnimation(toolUseId)
            }
        }
    }

    /**
     * Process progress messages - open file immediately
     */
    private async processProgressMessage(message: ChatMessage, tabId: string): Promise<void> {
        const fileList = message.header?.fileList
        if (!fileList?.filePaths?.[0] || !fileList.details) {
            return
        }

        const fileName = fileList.filePaths[0]
        const fileDetails = fileList.details[fileName]
        if (!fileDetails?.description) {
            return
        }

        const filePath = await this.resolveFilePath(fileDetails.description)
        if (!filePath) {
            getLogger().warn(`[DiffAnimationHandler] ⚠️ Could not resolve path for: ${fileDetails.description}`)
            return
        }

        // Extract toolUseId from progress message
        const toolUseId = message.messageId!.replace('progress_', '')

        getLogger().info(`[DiffAnimationHandler] 🎬 Opening file for toolUse ${toolUseId}: ${filePath}`)

        try {
            // Open the file
            const uri = vscode.Uri.file(filePath)
            let document: vscode.TextDocument
            let editor: vscode.TextEditor
            let originalContent = ''

            try {
                // Try to open existing file
                document = await vscode.workspace.openTextDocument(uri)
                originalContent = document.getText()
                editor = await vscode.window.showTextDocument(document, {
                    preview: false,
                    preserveFocus: false,
                })
                getLogger().info(`[DiffAnimationHandler] ✅ Opened existing file: ${filePath}`)
            } catch (error) {
                // File doesn't exist - create new file
                getLogger().info(`[DiffAnimationHandler] 🆕 Creating new file: ${filePath}`)
                await vscode.workspace.fs.writeFile(uri, Buffer.from(''))
                document = await vscode.workspace.openTextDocument(uri)
                editor = await vscode.window.showTextDocument(document, {
                    preview: false,
                    preserveFocus: false,
                })
            }

            // Cache file info for later animation
            this.activeFiles.set(toolUseId, {
                editor,
                originalContent,
                currentContent: originalContent,
                toolUseId,
            })

            // Cache original content
            this.fileOriginalContentCache.set(filePath, originalContent)

            getLogger().info(`[DiffAnimationHandler] 📁 File ready for animation: ${filePath}`)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to open file: ${error}`)
        }
    }

    /**
     * Process tool completion messages
     */
    private async processToolCompleteMessage(message: ChatMessage, tabId: string): Promise<void> {
        if (!message.messageId) {
            return
        }

        getLogger().info(`[DiffAnimationHandler] 🎯 Processing tool complete message: ${message.messageId}`)

        // Skip if already processed
        if (this.processedMessages.has(message.messageId)) {
            getLogger().info(`[DiffAnimationHandler] ⏭️ Already processed: ${message.messageId}`)
            return
        }
        this.processedMessages.add(message.messageId)

        // Trigger animation for this tool use
        await this.triggerDiffAnimation(message.messageId)
    }

    /**
     * Trigger diff animation when both original and new content are ready
     */
    private async triggerDiffAnimation(toolUseId: string): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 🎨 Triggering diff animation for toolUse: ${toolUseId}`)

        const diffData = this.diffContentMap.get(toolUseId)
        const fileInfo = this.activeFiles.get(toolUseId)

        if (!diffData || !fileInfo) {
            getLogger().warn(
                `[DiffAnimationHandler] ⚠️ Missing data for animation - diff: ${!!diffData}, file: ${!!fileInfo}`
            )
            return
        }

        if (diffData.originalContent === undefined || diffData.newContent === undefined) {
            getLogger().warn(`[DiffAnimationHandler] ⚠️ Incomplete diff content`)
            return
        }

        const { editor } = fileInfo
        const filePath = editor.document.uri.fsPath

        getLogger().info(
            `[DiffAnimationHandler] 🎬 Starting animation for ${filePath} - ` +
                `original: ${diffData.originalContent.length} chars, new: ${diffData.newContent.length} chars`
        )

        try {
            // Execute animation
            await this.diffAnimationController.startDiffAnimation(
                filePath,
                diffData.originalContent,
                diffData.newContent
            )

            // Update caches
            fileInfo.currentContent = diffData.newContent
            this.fileOriginalContentCache.set(filePath, diffData.newContent)

            // Cleanup
            this.diffContentMap.delete(toolUseId)
            this.activeFiles.delete(toolUseId)

            getLogger().info(`[DiffAnimationHandler] ✅ Animation completed for: ${filePath}`)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Animation failed: ${error}`)
        }
    }

    /**
     * Process file list from ChatMessage with animation queuing
     */
    private async processFileListResult(message: ChatMessage, tabId: string): Promise<void> {
        const fileList = message.header?.fileList
        if (!fileList?.filePaths || !fileList.details || !message.messageId) {
            return
        }

        // Skip if already processed
        if (this.processedMessages.has(message.messageId)) {
            getLogger().info(`[DiffAnimationHandler] ⏭️ Skipping already processed message: ${message.messageId}`)
            return
        }
        this.processedMessages.add(message.messageId)

        getLogger().info(`[DiffAnimationHandler] 📂 Processing fileList with messageId: ${message.messageId}`)
        getLogger().info(`[DiffAnimationHandler] 📄 Files to process: ${fileList.filePaths.join(', ')}`)

        for (const fileName of fileList.filePaths) {
            const fileDetails = fileList.details[fileName]
            if (!fileDetails) {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ No details for file: ${fileName}`)
                continue
            }

            const fullPath = fileDetails.description || fileName
            getLogger().info(`[DiffAnimationHandler] 🔍 Resolving path: ${fullPath}`)

            const normalizedPath = await this.resolveFilePath(fullPath)

            if (!normalizedPath) {
                getLogger().warn(`[DiffAnimationHandler] ❌ Could not resolve path for: ${fullPath}`)
                continue
            }

            getLogger().info(`[DiffAnimationHandler] ✅ Resolved to: ${normalizedPath}`)
            getLogger().info(
                `[DiffAnimationHandler] 📊 File changes: +${fileDetails.changes?.added || 0} -${fileDetails.changes?.deleted || 0}`
            )

            if (fileDetails.changes && (fileDetails.changes.added || fileDetails.changes.deleted)) {
                // Queue the animation
                getLogger().info(`[DiffAnimationHandler] 🎬 Queuing animation for: ${normalizedPath}`)
                await this.queueAnimation(normalizedPath, fileName, fileDetails, message.messageId)
            } else {
                // For files without changes, just open them
                getLogger().info(`[DiffAnimationHandler] 📖 Opening file without animation: ${normalizedPath}`)
                try {
                    const uri = vscode.Uri.file(normalizedPath)
                    const document = await vscode.workspace.openTextDocument(uri)
                    await vscode.window.showTextDocument(document, {
                        preview: false,
                        preserveFocus: false,
                    })
                    getLogger().info(`[DiffAnimationHandler] ✅ Opened file without changes: ${normalizedPath}`)
                } catch (error) {
                    getLogger().error(`[DiffAnimationHandler] ❌ Failed to open file: ${error}`)
                }
            }
        }
    }

    /**
     * Queue animations to prevent conflicts
     */
    private async queueAnimation(
        filePath: string,
        fileName: string,
        fileDetails: any,
        messageId: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const task: AnimationTask = {
                filePath,
                fileName,
                fileDetails,
                messageId,
                resolve,
                reject,
            }

            this.animationQueue.push(task)
            getLogger().info(
                `[DiffAnimationHandler] 📥 Queued animation for ${filePath}, queue length: ${this.animationQueue.length}, isProcessing: ${this.isProcessingAnimation}`
            )

            // Process queue if not already processing
            if (!this.isProcessingAnimation) {
                getLogger().info(`[DiffAnimationHandler] 🏃 Starting animation queue processing`)
                void this.processAnimationQueue()
            }
        })
    }

    /**
     * Process animation queue sequentially
     */
    private async processAnimationQueue(): Promise<void> {
        if (this.isProcessingAnimation || this.animationQueue.length === 0) {
            getLogger().info(
                `[DiffAnimationHandler] ⏭️ Queue processing skipped - isProcessing: ${this.isProcessingAnimation}, queueLength: ${this.animationQueue.length}`
            )
            return
        }

        this.isProcessingAnimation = true
        getLogger().info(
            `[DiffAnimationHandler] 🎯 Starting queue processing, ${this.animationQueue.length} tasks in queue`
        )

        while (this.animationQueue.length > 0) {
            const task = this.animationQueue.shift()!
            getLogger().info(`[DiffAnimationHandler] 🎬 Processing animation task for: ${task.filePath}`)

            try {
                await this.processFileWithAnimation(task.filePath, task.fileName, task.fileDetails, task.messageId)
                task.resolve()
                getLogger().info(`[DiffAnimationHandler] ✅ Animation task completed for: ${task.filePath}`)
            } catch (error) {
                getLogger().error(`[DiffAnimationHandler] ❌ Animation failed for ${task.filePath}: ${error}`)
                task.reject(error)
            }

            // Small delay between animations for better visibility
            if (this.animationQueue.length > 0) {
                getLogger().info(`[DiffAnimationHandler] ⏱️ Waiting 300ms before next animation`)
                await new Promise<void>((resolve) => setTimeout(resolve, 300))
            }
        }

        this.isProcessingAnimation = false
        getLogger().info(`[DiffAnimationHandler] ✅ Queue processing completed`)
    }

    /**
     * Process file with animation (legacy method for queued animations)
     */
    private async processFileWithAnimation(
        normalizedPath: string,
        fileName: string,
        fileDetails: any,
        messageId: string
    ): Promise<void> {
        getLogger().info(
            `[DiffAnimationHandler] 🎨 Starting animation for file: ${fileName}, path: ${normalizedPath}, messageId: ${messageId}, changes: +${fileDetails.changes.added} -${fileDetails.changes.deleted}`
        )
        getLogger().info(
            `[DiffAnimationHandler] 🔍 Available diff keys: ${Array.from(this.diffContentMap.keys()).join(', ')}`
        )

        this.animatingFiles.add(normalizedPath)
        getLogger().info(`[DiffAnimationHandler] 🎬 Added to animatingFiles: ${normalizedPath}`)

        try {
            // Open the file
            const uri = vscode.Uri.file(normalizedPath)
            let document: vscode.TextDocument
            let editor: vscode.TextEditor
            let isNewFile = false
            let fileExistsBeforeOpen = false

            // Check if file exists
            try {
                await vscode.workspace.fs.stat(uri)
                fileExistsBeforeOpen = true
                getLogger().info(`[DiffAnimationHandler] 📄 File exists: ${normalizedPath}`)
            } catch {
                fileExistsBeforeOpen = false
                getLogger().info(`[DiffAnimationHandler] 🆕 File does not exist: ${normalizedPath}`)
            }

            try {
                // Try to open existing file
                document = await vscode.workspace.openTextDocument(uri)
                editor = await vscode.window.showTextDocument(document, {
                    preview: false,
                    preserveFocus: false,
                })
                getLogger().info(`[DiffAnimationHandler] ✅ Opened existing file: ${normalizedPath}`)
            } catch (error) {
                // File doesn't exist - create new document
                isNewFile = true
                getLogger().info(`[DiffAnimationHandler] 🆕 File doesn't exist, creating new document: ${error}`)

                // For new files, use empty string as original content
                this.fileOriginalContentCache.set(normalizedPath, '')

                // Create empty file first
                await vscode.workspace.fs.writeFile(uri, Buffer.from(''))

                document = await vscode.workspace.openTextDocument(uri)
                editor = await vscode.window.showTextDocument(document, {
                    preview: false,
                    preserveFocus: false,
                })

                getLogger().info(`[DiffAnimationHandler] ✅ Created and opened new file: ${normalizedPath}`)
            }

            // Get the current content
            const currentContent = document.getText()
            getLogger().info(`[DiffAnimationHandler] 📏 Current content length: ${currentContent.length}`)

            // Check if we have diff content from additionalMessages
            // Try to find diff content using both the messageId directly and by checking for related IDs
            let diffData = this.diffContentMap.get(messageId)
            getLogger().info(
                `[DiffAnimationHandler] 🔍 Looking for diff data with messageId: ${messageId}, found: ${!!diffData}`
            )

            // If not found directly, check if there are entries with _original/_new suffixes related to this messageId
            if (!diffData || diffData.originalContent === undefined || diffData.newContent === undefined) {
                getLogger().info(`[DiffAnimationHandler] 🔍 Direct lookup failed, trying alternative keys`)

                // Look for entries that might be related to this messageId (removing tool prefix)
                const possibleBaseIds = [
                    messageId.split('_')[0], // Try base ID without suffixes
                    messageId.replace('_tool', ''), // Try without _tool suffix
                ]

                for (const [key, value] of this.diffContentMap.entries()) {
                    if (
                        possibleBaseIds.some((id) => key.startsWith(id)) &&
                        value.originalContent !== undefined &&
                        value.newContent !== undefined
                    ) {
                        diffData = value
                        getLogger().info(`[DiffAnimationHandler] ✅ Found matching diff content with key: ${key}`)
                        break
                    }
                }
            }

            if (diffData && diffData.originalContent !== undefined && diffData.newContent !== undefined) {
                getLogger().info(
                    `[DiffAnimationHandler] ✅ Using diff content from additionalMessages for messageId: ${messageId}`
                )
                getLogger().info(
                    `[DiffAnimationHandler] 📊 Original: ${diffData.originalContent.length} chars, New: ${diffData.newContent.length} chars`
                )

                // Small delay to ensure editor is fully loaded
                await new Promise((resolve) => setTimeout(resolve, 100))

                // Start the animation with content from additionalMessages
                getLogger().info(`[DiffAnimationHandler] 🎬 Starting diff animation`)
                await this.diffAnimationController.startDiffAnimation(
                    normalizedPath,
                    diffData.originalContent,
                    diffData.newContent
                )

                // Update cached original content AFTER animation completes
                this.fileOriginalContentCache.set(normalizedPath, currentContent)

                // Clean up the diff content from map
                this.diffContentMap.delete(messageId)

                getLogger().info(`[DiffAnimationHandler] ✅ Animation completed for: ${normalizedPath}`)
            } else {
                // Fallback to existing logic if no diff content from additionalMessages
                getLogger().info(
                    `[DiffAnimationHandler] ⚠️ No diff content from additionalMessages, using fallback logic`
                )

                // Get original content
                let originalContent: string = ''

                // First, check if this was a new file that didn't exist before
                if (!fileExistsBeforeOpen || isNewFile) {
                    originalContent = ''
                    getLogger().info(`[DiffAnimationHandler] 🆕 Using empty string as original content for new file`)
                } else {
                    // Try to get from cache
                    originalContent = this.fileOriginalContentCache.get(normalizedPath) || ''
                    getLogger().info(
                        `[DiffAnimationHandler] 📋 Original content from cache: ${originalContent !== undefined ? 'found' : 'not found'}`
                    )
                }

                // Check if content actually changed
                if (originalContent !== currentContent) {
                    getLogger().info(
                        `[DiffAnimationHandler] 🔄 Content changed - starting diff animation. Original: ${originalContent.length} chars, New: ${currentContent.length} chars`
                    )

                    // Small delay to ensure editor is fully loaded
                    await new Promise((resolve) => setTimeout(resolve, 100))

                    // Start the animation
                    await this.diffAnimationController.startDiffAnimation(
                        normalizedPath,
                        originalContent,
                        currentContent
                    )

                    // Update cached original content AFTER animation completes
                    this.fileOriginalContentCache.set(normalizedPath, currentContent)

                    getLogger().info(`[DiffAnimationHandler] ✅ Animation completed for: ${normalizedPath}`)
                } else {
                    getLogger().warn(
                        `[DiffAnimationHandler] ⚠️ No content change detected for: ${normalizedPath}. Original exists: ${originalContent !== undefined}, are same: ${originalContent === currentContent}`
                    )

                    // Show simple decoration as fallback
                    await this.showFallbackDecoration(editor, fileDetails)
                }
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process file: ${error}`)
        } finally {
            this.animatingFiles.delete(normalizedPath)
            getLogger().info(`[DiffAnimationHandler] 🧹 Removed from animatingFiles: ${normalizedPath}`)
        }
    }

    /**
     * Show fallback decoration when animation cannot be performed
     */
    private async showFallbackDecoration(editor: vscode.TextEditor, fileDetails: any): Promise<void> {
        const changeDecoration = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: 'rgba(255, 255, 0, 0.1)',
            after: {
                contentText: ` 🔄 Modified by Amazon Q - ${fileDetails.changes.added || 0} additions, ${fileDetails.changes.deleted || 0} deletions`,
                color: 'rgba(255, 255, 0, 0.7)',
                fontStyle: 'italic',
            },
        })

        editor.setDecorations(changeDecoration, [new vscode.Range(0, 0, 0, 0)])

        setTimeout(() => {
            changeDecoration.dispose()
        }, 5000)
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
                return undefined
            }

            getLogger().info(`[DiffAnimationHandler] 📁 Found ${workspaceFolders.length} workspace folders`)

            // Try each workspace folder
            for (const folder of workspaceFolders) {
                const absolutePath = path.join(folder.uri.fsPath, filePath)
                getLogger().info(`[DiffAnimationHandler] 🔍 Trying: ${absolutePath}`)

                try {
                    // Check if file exists
                    await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath))
                    getLogger().info(`[DiffAnimationHandler] ✅ File exists, resolved ${filePath} to ${absolutePath}`)
                    return absolutePath
                } catch {
                    getLogger().info(`[DiffAnimationHandler] ❌ File not found in: ${absolutePath}`)
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
            // Check if it's already a file path
            if (path.isAbsolute(pathOrUri)) {
                getLogger().info(`[DiffAnimationHandler] ✅ Already absolute path: ${pathOrUri}`)
                return pathOrUri
            }

            // Handle file:// protocol explicitly
            if (pathOrUri.startsWith('file://')) {
                const fsPath = vscode.Uri.parse(pathOrUri).fsPath
                getLogger().info(`[DiffAnimationHandler] ✅ Converted file:// URI to: ${fsPath}`)
                return fsPath
            }

            // Try to parse as URI
            try {
                const uri = vscode.Uri.parse(pathOrUri)
                if (uri.scheme === 'file') {
                    getLogger().info(`[DiffAnimationHandler] ✅ Parsed as file URI: ${uri.fsPath}`)
                    return uri.fsPath
                }
            } catch {
                getLogger().info(`[DiffAnimationHandler] ⚠️ Not a valid URI, treating as path`)
                // Invalid URI format, continue to fallback
            }

            // Handle relative paths by resolving against workspace folders
            const workspaceFolders = vscode.workspace.workspaceFolders
            if (workspaceFolders && workspaceFolders.length > 0) {
                // Try to find the file in any workspace folder
                for (const folder of workspaceFolders) {
                    const possiblePath = path.join(folder.uri.fsPath, pathOrUri)
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(possiblePath))
                        getLogger().info(`[DiffAnimationHandler] ✅ Resolved relative path to: ${possiblePath}`)
                        return possiblePath
                    } catch {
                        // File doesn't exist in this workspace, continue to next
                    }
                }

                // If not found, default to first workspace
                const defaultPath = path.join(workspaceFolders[0].uri.fsPath, pathOrUri)
                getLogger().info(`[DiffAnimationHandler] 🆕 Using default workspace path: ${defaultPath}`)
                return defaultPath
            }

            // Fallback: treat as path
            getLogger().info(`[DiffAnimationHandler] ⚠️ Using as-is: ${pathOrUri}`)
            return pathOrUri
        } catch (error: any) {
            getLogger().error(`[DiffAnimationHandler] ❌ Error normalizing file path: ${error}`)
            return pathOrUri
        }
    }

    /**
     * Clear caches for a specific tab (useful when conversation ends)
     */
    public clearTabCache(tabId: string): void {
        // Clear processed messages for the tab
        this.processedMessages.clear()
        getLogger().info(`[DiffAnimationHandler] 🧹 Cleared cache for tab ${tabId}`)
    }

    /**
     * Clear animating files (for error recovery)
     */
    public clearAnimatingFiles(): void {
        getLogger().info(
            `[DiffAnimationHandler] 🧹 Clearing all animating files: ${Array.from(this.animatingFiles).join(', ')}`
        )
        this.animatingFiles.clear()
    }

    public dispose(): void {
        getLogger().info(`[DiffAnimationHandler] 💥 Disposing DiffAnimationHandler`)
        this.fileChangeCache.clear()
        this.diffContentMap.clear()
        this.fileOriginalContentCache.clear()
        this.processedMessages.clear()
        this.animatingFiles.clear()
        this.activeFiles.clear()
        this.animationQueue = []
        this.diffAnimationController.dispose()

        // Dispose all event listeners
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
