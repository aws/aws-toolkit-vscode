/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { ChatResult, ChatMessage, ChatUpdateParams } from '@aws/language-server-runtimes/protocol'
import { getLogger } from 'aws-core-vscode/shared'
import { DiffAnimationController } from './diffAnimationController'

interface PendingFileWrite {
    filePath: string
    originalContent: string
    toolUseId: string
    timestamp: number
}

export class DiffAnimationHandler implements vscode.Disposable {
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

    constructor() {
        getLogger().info(`[DiffAnimationHandler] 🚀 Initializing DiffAnimationHandler`)
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

            // Check if this is an external change (not from user typing)
            if (event.reason === undefined) {
                await this.handleFileChange(event.document.uri)
            }
        })
        this.disposables.push(changeTextDocumentDisposable)
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

        // Check for fsWrite tool preparation (when tool is about to execute)
        if (message.type === 'tool' && message.messageId.startsWith('progress_')) {
            await this.processFsWritePreparation(message, tabId)
        }
    }

    /**
     * Process fsWrite preparation - capture content BEFORE file is written
     */
    private async processFsWritePreparation(message: ChatMessage, tabId: string): Promise<void> {
        const fileList = message.header?.fileList
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
                // Create empty file
                await vscode.workspace.fs.writeFile(uri, Buffer.from(''))
            }

            // Open the document
            const document = await vscode.workspace.openTextDocument(uri)
            await vscode.window.showTextDocument(document, {
                preview: false,
                preserveFocus: false,
            })

            getLogger().info(`[DiffAnimationHandler] ✅ File opened and ready: ${filePath}`)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to prepare file: ${error}`)
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
            const document = await vscode.workspace.openTextDocument(uri)
            const newContent = document.getText()

            // Check if content actually changed
            if (pendingWrite.originalContent !== newContent) {
                getLogger().info(
                    `[DiffAnimationHandler] 🎬 Content changed, starting animation - ` +
                        `original: ${pendingWrite.originalContent.length} chars, new: ${newContent.length} chars`
                )

                // Start the animation
                await this.animateFileChange(filePath, pendingWrite.originalContent, newContent, pendingWrite.toolUseId)
            } else {
                getLogger().info(`[DiffAnimationHandler] ℹ️ No content change for: ${filePath}`)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process file change: ${error}`)
        }
    }

    /**
     * Animate file changes
     */
    private async animateFileChange(
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

        try {
            getLogger().info(`[DiffAnimationHandler] 🔄 Animating file change: ${filePath}`)

            // Open the file
            try {
                const uri = vscode.Uri.file(filePath)
                const document = await vscode.workspace.openTextDocument(uri)
                await vscode.window.showTextDocument(document, { preview: false })
            } catch (error) {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Could not open file: ${error}`)
            }

            // Start the animation
            await this.diffAnimationController.startDiffAnimation(filePath, originalContent, newContent)

            getLogger().info(`[DiffAnimationHandler] ✅ Animation completed for: ${filePath}`)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to animate: ${error}`)
        } finally {
            this.animatingFiles.delete(filePath)
        }
    }

    /**
     * Process file diff parameters directly (for backwards compatibility)
     */
    public async processFileDiff(params: {
        originalFileUri: string
        originalFileContent?: string
        fileContent?: string
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

            if (originalContent !== newContent) {
                getLogger().info(`[DiffAnimationHandler] ✨ Content differs, starting diff animation`)

                // Open the file first
                try {
                    const uri = vscode.Uri.file(filePath)
                    await vscode.window.showTextDocument(uri, { preview: false })
                } catch (error) {
                    getLogger().warn(`[DiffAnimationHandler] ⚠️ Could not open file: ${error}`)
                }

                await this.diffAnimationController.startDiffAnimation(filePath, originalContent, newContent)
            } else {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Original and new content are identical`)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process file diff: ${error}`)
        }
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

        for (const [filePath, write] of this.pendingWrites) {
            if (now - write.timestamp > timeout) {
                this.pendingWrites.delete(filePath)
            }
        }

        getLogger().info(`[DiffAnimationHandler] 🧹 Cleared old pending writes`)
    }

    public dispose(): void {
        getLogger().info(`[DiffAnimationHandler] 💥 Disposing DiffAnimationHandler`)
        this.pendingWrites.clear()
        this.processedMessages.clear()
        this.animatingFiles.clear()
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
