/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DiffAnimationHandler - Temporary File Animation Approach
 *
 * Uses temporary files to show diff animations, with one temp file per source file:
 * 1. When file change detected, create or reuse a temporary file
 * 2. Show animation in the temporary file (red deletions → green additions)
 * 3. Update the actual file with final content
 * 4. Keep temp file open for reuse on subsequent changes
 *
 * Benefits:
 * - Deletion animations (red lines) are always visible
 * - One temp file per source file - reused for multiple animations
 * - Clear separation between animation and actual file
 * - No race conditions or timing issues
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
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
    /**
     * BEHAVIOR SUMMARY:
     *
     * 1. ONE TEMP FILE PER SOURCE FILE
     *    - Each source file gets exactly ONE temporary file
     *    - The temp file is reused for all subsequent changes
     *    - Example: "index.js" → "[DIFF] index.js" (always the same temp file)
     *
     * 2. TEMP FILES AUTOMATICALLY OPEN
     *    - When a file is about to be modified, its temp file opens automatically
     *    - Temp files appear in the second column (side-by-side view)
     *    - Files stay open for future animations
     *
     * 3. ANIMATION FLOW
     *    - Detect change in source file
     *    - Find or create temp file for that source
     *    - Replace temp file content with original
     *    - Run animation (red deletions → green additions)
     *    - Return focus to source file
     *    - Keep temp file open for next time
     *
     * This ensures deletion animations always show properly!
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
    // Track temporary files for cleanup - maps original file path to temp file path
    private tempFileMapping = new Map<string, string>()
    // Track open temp file editors - maps temp file path to editor
    private tempFileEditors = new Map<string, vscode.TextEditor>()

    constructor() {
        getLogger().info(`[DiffAnimationHandler] 🚀 Initializing DiffAnimationHandler`)
        this.diffAnimationController = new DiffAnimationController()

        // Set up file system watcher for all files
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*')

        // Watch for file changes
        this.fileWatcher.onDidChange(async (uri) => {
            // Skip temporary files
            if (this.isTempFile(uri.fsPath)) {
                return
            }
            await this.handleFileChange(uri)
        })

        // Watch for file creation
        this.fileWatcher.onDidCreate(async (uri) => {
            // Skip temporary files
            if (this.isTempFile(uri.fsPath)) {
                return
            }
            await this.handleFileChange(uri)
        })

        this.disposables.push(this.fileWatcher)

        // Also listen to text document changes for more immediate detection
        const changeTextDocumentDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document.uri.scheme !== 'file' || event.contentChanges.length === 0) {
                return
            }

            // Skip temporary files
            if (this.isTempFile(event.document.uri.fsPath)) {
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

        // Listen for editor close events to clean up temp file references
        const onDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument((document) => {
            const filePath = document.uri.fsPath
            if (this.isTempFile(filePath)) {
                // Remove from editor tracking
                this.tempFileEditors.delete(filePath)
                getLogger().info(`[DiffAnimationHandler] 📄 Temp file editor closed: ${filePath}`)
            }
        })
        this.disposables.push(onDidCloseTextDocument)
    }

    /**
     * Check if a file path is a temporary file
     */
    private isTempFile(filePath: string): boolean {
        // Check if this path is in our temp file mappings
        for (const tempPath of this.tempFileMapping.values()) {
            if (filePath === tempPath) {
                return true
            }
        }
        return false
    }

    /**
     * Focus on the temp file for a specific source file (if it exists)
     */
    public async focusTempFile(sourceFilePath: string): Promise<boolean> {
        const tempFilePath = this.tempFileMapping.get(sourceFilePath)
        if (!tempFilePath) {
            return false
        }

        const editor = this.tempFileEditors.get(tempFilePath)
        if (editor && !editor.document.isClosed) {
            await vscode.window.showTextDocument(editor.document, {
                preview: false,
                preserveFocus: false,
            })
            getLogger().info(`[DiffAnimationHandler] 👁️ Focused on temp file for: ${sourceFilePath}`)
            return true
        }

        return false
    }

    /**
     * Get information about active temp files (for debugging)
     */
    public getTempFileInfo(): { sourceFile: string; tempFile: string; isOpen: boolean }[] {
        const info: { sourceFile: string; tempFile: string; isOpen: boolean }[] = []

        for (const [sourceFile, tempFile] of this.tempFileMapping) {
            const editor = this.tempFileEditors.get(tempFile)
            info.push({
                sourceFile,
                tempFile,
                isOpen: editor ? !editor.document.isClosed : false,
            })
        }

        return info
    }

    /**
     * Close temp file for a specific source file
     */
    public async closeTempFileForSource(sourceFilePath: string): Promise<void> {
        const tempFilePath = this.tempFileMapping.get(sourceFilePath)
        if (!tempFilePath) {
            return
        }

        const editor = this.tempFileEditors.get(tempFilePath)
        if (editor && !editor.document.isClosed) {
            // We can't programmatically close the editor, but we can clean up our references
            this.tempFileEditors.delete(tempFilePath)
            getLogger().info(`[DiffAnimationHandler] 🧹 Cleaned up temp file references for: ${sourceFilePath}`)
        }

        // Delete the temp file
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(tempFilePath))
            this.tempFileMapping.delete(sourceFilePath)
            getLogger().info(`[DiffAnimationHandler] 🗑️ Deleted temp file: ${tempFilePath}`)
        } catch (error) {
            getLogger().warn(`[DiffAnimationHandler] ⚠️ Failed to delete temp file: ${error}`)
        }
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
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.tmpdir(),
            'test_animation.js'
        )
        getLogger().info(`[DiffAnimationHandler] 🧪 Running test animation for: ${testFilePath}`)

        // First simulate the preparation phase (which opens the temp file)
        await this.openOrCreateTempFile(testFilePath, originalContent)

        // Then run the animation
        await this.animateFileChangeWithTemp(testFilePath, originalContent, newContent, 'test')
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
                // Create empty file
                await vscode.workspace.fs.writeFile(uri, Buffer.from(''))
            }

            // Open the document (but keep it in background)
            const document = await vscode.workspace.openTextDocument(uri)
            await vscode.window.showTextDocument(document, {
                preview: false,
                preserveFocus: true, // Keep focus on current editor
                viewColumn: vscode.ViewColumn.One, // Open in first column
            })

            // IMPORTANT: Automatically open the corresponding temp file if it exists
            // This ensures the user can see the animation without manually opening the temp file
            await this.openOrCreateTempFile(filePath, originalContent)

            getLogger().info(`[DiffAnimationHandler] ✅ File opened and ready: ${filePath}`)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to prepare file: ${error}`)
            // Clean up on error
            this.pendingWrites.delete(filePath)
        }
    }

    /**
     * Open or create the temp file for a source file
     */
    private async openOrCreateTempFile(sourceFilePath: string, initialContent: string): Promise<void> {
        const tempFilePath = this.getOrCreateTempFilePath(sourceFilePath)

        // Check if we already have an editor open for this temp file
        let tempFileEditor = this.tempFileEditors.get(tempFilePath)

        if (tempFileEditor && tempFileEditor.document && !tempFileEditor.document.isClosed) {
            // Temp file is already open, just ensure it's visible
            getLogger().info(`[DiffAnimationHandler] 👁️ Temp file already open, making it visible`)
            await vscode.window.showTextDocument(tempFileEditor.document, {
                preview: false,
                preserveFocus: true,
                viewColumn: vscode.ViewColumn.Two,
            })
        } else {
            // Need to create/open the temp file
            getLogger().info(`[DiffAnimationHandler] 📄 Opening temp file for: ${sourceFilePath}`)

            const tempUri = vscode.Uri.file(tempFilePath)

            try {
                // Check if temp file exists
                await vscode.workspace.fs.stat(tempUri)
            } catch {
                // File doesn't exist, create it with initial content
                await vscode.workspace.fs.writeFile(tempUri, Buffer.from(initialContent, 'utf8'))
            }

            // Ensure we have a two-column layout
            await vscode.commands.executeCommand('workbench.action.editorLayoutTwoColumns')

            // Open temp file in editor
            const tempDoc = await vscode.workspace.openTextDocument(tempUri)
            tempFileEditor = await vscode.window.showTextDocument(tempDoc, {
                preview: false,
                preserveFocus: true, // Don't steal focus
                viewColumn: vscode.ViewColumn.Two, // Show in second column
            })

            // Add a header comment to indicate this is a diff animation file
            const header = `// 🎬 DIFF ANIMATION for: ${path.basename(sourceFilePath)}\n// This file shows animations of changes (Red = Deleted, Green = Added)\n// ${'='.repeat(60)}\n\n`
            if (!tempDoc.getText().startsWith(header)) {
                await tempFileEditor.edit((editBuilder) => {
                    editBuilder.insert(new vscode.Position(0, 0), header)
                })
                await tempDoc.save()
            }

            // Store the editor reference
            this.tempFileEditors.set(tempFilePath, tempFileEditor)

            // Set the language mode to match the original file
            const ext = path.extname(sourceFilePath).substring(1).toLowerCase()
            const languageMap: { [key: string]: string } = {
                js: 'javascript',
                ts: 'typescript',
                jsx: 'javascriptreact',
                tsx: 'typescriptreact',
                py: 'python',
                rb: 'ruby',
                go: 'go',
                rs: 'rust',
                java: 'java',
                cpp: 'cpp',
                c: 'c',
                cs: 'csharp',
                php: 'php',
                swift: 'swift',
                kt: 'kotlin',
                md: 'markdown',
                json: 'json',
                xml: 'xml',
                yaml: 'yaml',
                yml: 'yaml',
                html: 'html',
                css: 'css',
                scss: 'scss',
                less: 'less',
                sql: 'sql',
                sh: 'shellscript',
                bash: 'shellscript',
                ps1: 'powershell',
                r: 'r',
                dart: 'dart',
                vue: 'vue',
                lua: 'lua',
                pl: 'perl',
            }
            const languageId = languageMap[ext] || ext || 'plaintext'

            try {
                await vscode.languages.setTextDocumentLanguage(tempDoc, languageId)
                getLogger().info(`[DiffAnimationHandler] 🎨 Set language mode to: ${languageId}`)
            } catch (error) {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Failed to set language mode: ${error}`)
            }
        }

        getLogger().info(`[DiffAnimationHandler] ✅ Temp file is ready and visible`)
    }

    /**
     * Handle file changes - this is where we detect the actual write
     */
    private async handleFileChange(uri: vscode.Uri): Promise<void> {
        const filePath = uri.fsPath

        // Skip if we're already animating this file
        if (this.animatingFiles.has(filePath)) {
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
            // Read the new content
            const newContentBuffer = await vscode.workspace.fs.readFile(uri)
            const newContent = Buffer.from(newContentBuffer).toString('utf8')

            // Check if content actually changed
            if (pendingWrite.originalContent !== newContent) {
                getLogger().info(
                    `[DiffAnimationHandler] 🎬 Content changed, starting animation - ` +
                        `original: ${pendingWrite.originalContent.length} chars, new: ${newContent.length} chars`
                )

                // Start the animation using temporary file
                await this.animateFileChangeWithTemp(
                    filePath,
                    pendingWrite.originalContent,
                    newContent,
                    pendingWrite.toolUseId
                )
            } else {
                getLogger().info(`[DiffAnimationHandler] ℹ️ No content change for: ${filePath}`)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process file change: ${error}`)
        }
    }

    /**
     * Get or create a temporary file path for the given original file
     */
    private getOrCreateTempFilePath(originalPath: string): string {
        // Check if we already have a temp file for this original file
        const existingTempPath = this.tempFileMapping.get(originalPath)
        if (existingTempPath) {
            getLogger().info(`[DiffAnimationHandler] 🔄 Reusing existing temp file: ${existingTempPath}`)
            return existingTempPath
        }

        // Create new temp file path
        const ext = path.extname(originalPath)
        const basename = path.basename(originalPath, ext)
        // Use a consistent name for the temp file (no timestamp) so it's easier to identify
        const tempName = `[DIFF] ${basename}${ext}`
        const tempDir = path.join(os.tmpdir(), 'vscode-diff-animations')

        // Ensure temp directory exists
        try {
            if (!require('fs').existsSync(tempDir)) {
                require('fs').mkdirSync(tempDir, { recursive: true })
            }
        } catch (error) {
            getLogger().warn(`[DiffAnimationHandler] Failed to create temp dir: ${error}`)
        }

        const tempPath = path.join(tempDir, tempName)

        // Store the mapping
        this.tempFileMapping.set(originalPath, tempPath)
        getLogger().info(`[DiffAnimationHandler] 📄 Created new temp file mapping: ${originalPath} → ${tempPath}`)

        return tempPath
    }

    /**
     * Animate file changes using a temporary file
     */
    private async animateFileChangeWithTemp(
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

        // Get or create temporary file path
        const tempFilePath = this.getOrCreateTempFilePath(filePath)

        getLogger().info(`[DiffAnimationHandler] 🎬 Starting animation ${animationId}`)
        getLogger().info(`[DiffAnimationHandler] 📄 Using temporary file: ${tempFilePath}`)

        let tempFileEditor: vscode.TextEditor | undefined

        try {
            // Check if we already have an editor open for this temp file
            tempFileEditor = this.tempFileEditors.get(tempFilePath)

            if (tempFileEditor && tempFileEditor.document && !tempFileEditor.document.isClosed) {
                // Reuse existing editor
                getLogger().info(`[DiffAnimationHandler] ♻️ Reusing existing temp file editor`)

                // Make sure it's visible and focused for the animation
                tempFileEditor = await vscode.window.showTextDocument(tempFileEditor.document, {
                    preview: false,
                    preserveFocus: false, // Take focus for animation
                    viewColumn: tempFileEditor.viewColumn || vscode.ViewColumn.Two,
                })

                // Replace content with original content for this animation
                await tempFileEditor.edit((editBuilder) => {
                    const fullRange = new vscode.Range(
                        tempFileEditor!.document.positionAt(0),
                        tempFileEditor!.document.positionAt(tempFileEditor!.document.getText().length)
                    )
                    editBuilder.replace(fullRange, originalContent)
                })

                await tempFileEditor.document.save()
            } else {
                // Create new temp file or open existing one
                const tempUri = vscode.Uri.file(tempFilePath)

                // Write original content to temp file
                getLogger().info(
                    `[DiffAnimationHandler] 📝 Writing original content to temp file (${originalContent.length} chars)`
                )
                await vscode.workspace.fs.writeFile(tempUri, Buffer.from(originalContent, 'utf8'))

                // Open temp file in editor
                let tempDoc = await vscode.workspace.openTextDocument(tempUri)

                // Ensure the temp document has the correct content
                if (tempDoc.getText() !== originalContent) {
                    getLogger().warn(`[DiffAnimationHandler] ⚠️ Temp file content mismatch, rewriting...`)
                    await vscode.workspace.fs.writeFile(tempUri, Buffer.from(originalContent, 'utf8'))
                    tempDoc = await vscode.workspace.openTextDocument(tempUri)
                }

                // Show the temp file in a new editor
                tempFileEditor = await vscode.window.showTextDocument(tempDoc, {
                    preview: false,
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.Two, // Show in second column
                })

                // Store the editor reference
                this.tempFileEditors.set(tempFilePath, tempFileEditor)

                // Set the language mode to match the original file for proper syntax highlighting
                const ext = path.extname(filePath).substring(1).toLowerCase()
                const languageMap: { [key: string]: string } = {
                    js: 'javascript',
                    ts: 'typescript',
                    jsx: 'javascriptreact',
                    tsx: 'typescriptreact',
                    py: 'python',
                    rb: 'ruby',
                    go: 'go',
                    rs: 'rust',
                    java: 'java',
                    cpp: 'cpp',
                    c: 'c',
                    cs: 'csharp',
                    php: 'php',
                    swift: 'swift',
                    kt: 'kotlin',
                    md: 'markdown',
                    json: 'json',
                    xml: 'xml',
                    yaml: 'yaml',
                    yml: 'yaml',
                    html: 'html',
                    css: 'css',
                    scss: 'scss',
                    less: 'less',
                    sql: 'sql',
                    sh: 'shellscript',
                    bash: 'shellscript',
                    ps1: 'powershell',
                    r: 'r',
                    dart: 'dart',
                    vue: 'vue',
                    lua: 'lua',
                    pl: 'perl',
                }
                const languageId = languageMap[ext] || ext || 'plaintext'

                try {
                    await vscode.languages.setTextDocumentLanguage(tempDoc, languageId)
                    getLogger().info(`[DiffAnimationHandler] 🎨 Set language mode to: ${languageId}`)
                } catch (error) {
                    getLogger().warn(`[DiffAnimationHandler] ⚠️ Failed to set language mode: ${error}`)
                }
            }

            // Wait for editor to be ready
            await new Promise((resolve) => setTimeout(resolve, 300))

            // Verify the editor is showing our temp file
            if (vscode.window.activeTextEditor?.document.uri.fsPath !== tempFilePath) {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Active editor is not showing temp file, refocusing...`)
                tempFileEditor = await vscode.window.showTextDocument(tempFileEditor.document, {
                    preview: false,
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.Active,
                })
                await new Promise((resolve) => setTimeout(resolve, 200))
            }

            // Double-check the document content before animation
            const currentContent = tempFileEditor.document.getText()
            if (currentContent !== originalContent) {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Document content changed, restoring original content`)
                await tempFileEditor.edit((editBuilder) => {
                    const fullRange = new vscode.Range(
                        tempFileEditor!.document.positionAt(0),
                        tempFileEditor!.document.positionAt(currentContent.length)
                    )
                    editBuilder.replace(fullRange, originalContent)
                })
                await tempFileEditor.document.save()
                await new Promise((resolve) => setTimeout(resolve, 100))
            }

            getLogger().info(`[DiffAnimationHandler] 🎨 Starting diff animation on temp file`)
            getLogger().info(
                `[DiffAnimationHandler] 📊 Animation details: from ${originalContent.length} chars to ${newContent.length} chars`
            )

            // Show a status message
            vscode.window.setStatusBarMessage(`🎬 Animating changes for ${path.basename(filePath)}...`, 5000)

            // Ensure the temp file editor is still active
            if (vscode.window.activeTextEditor !== tempFileEditor) {
                await vscode.window.showTextDocument(tempFileEditor.document, {
                    preview: false,
                    preserveFocus: false,
                })
            }

            // Run animation on temp file
            try {
                await this.diffAnimationController.startDiffAnimation(tempFilePath, originalContent, newContent)
                getLogger().info(`[DiffAnimationHandler] ✅ Animation completed successfully`)
            } catch (animError) {
                getLogger().error(`[DiffAnimationHandler] ❌ Animation failed: ${animError}`)
                // Try alternative approach: direct file write
                getLogger().info(`[DiffAnimationHandler] 🔄 Attempting fallback animation approach`)
                await vscode.workspace.fs.writeFile(vscode.Uri.file(tempFilePath), Buffer.from(newContent, 'utf8'))
                throw animError
            }

            // IMPORTANT: We keep the temp file open after animation!
            // This allows us to reuse it for subsequent changes to the same file.
            // The temp file will show all animations for a specific source file.
            // Benefits:
            // - One temp file per source file (not multiple)
            // - User can see the history of changes
            // - Better performance (no need to create new files)
            // - Clear visual separation from actual file
            // - Automatically opens when file is being modified

            // Keep temp file open after animation (don't close it)
            // The user can close it manually or it will be reused for next animation
            getLogger().info(`[DiffAnimationHandler] 📌 Keeping temp file open for potential reuse`)

            // Show completion message
            vscode.window.setStatusBarMessage(`✅ Animation completed for ${path.basename(filePath)}`, 3000)

            // Focus back on the original file
            const originalUri = vscode.Uri.file(filePath)
            try {
                const originalDoc = await vscode.workspace.openTextDocument(originalUri)
                await vscode.window.showTextDocument(originalDoc, {
                    preview: false,
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.One,
                })
            } catch (error) {
                getLogger().warn(`[DiffAnimationHandler] ⚠️ Could not focus original file: ${error}`)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to animate ${animationId}: ${error}`)
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

                // Use temp file approach for this too
                await this.animateFileChangeWithTemp(filePath, originalContent, newContent, 'manual_diff')
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

        // Clean up closed temp file editors
        for (const [tempPath, editor] of this.tempFileEditors) {
            if (!editor || editor.document.isClosed) {
                this.tempFileEditors.delete(tempPath)
                getLogger().info(`[DiffAnimationHandler] 🧹 Removed closed temp file editor: ${tempPath}`)
            }
        }

        if (cleanedWrites > 0) {
            getLogger().info(`[DiffAnimationHandler] 🧹 Cleared ${cleanedWrites} old pending writes`)
        }
    }

    public async dispose(): Promise<void> {
        getLogger().info(`[DiffAnimationHandler] 💥 Disposing DiffAnimationHandler`)

        // Close all temp file editors
        for (const [tempPath, editor] of this.tempFileEditors) {
            try {
                if (editor && !editor.document.isClosed) {
                    getLogger().info(`[DiffAnimationHandler] 📄 Closing temp file editor: ${tempPath}`)
                    // Note: We can't programmatically close editors, but we can clean up our references
                }
            } catch (error) {
                // Ignore errors during cleanup
            }
        }

        // Clean up any remaining temp files
        for (const tempPath of this.tempFileMapping.values()) {
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(tempPath))
                getLogger().info(`[DiffAnimationHandler] 🗑️ Deleted temp file: ${tempPath}`)
            } catch (error) {
                // Ignore errors during cleanup
            }
        }

        // Clear all tracking sets and maps
        this.pendingWrites.clear()
        this.processedMessages.clear()
        this.animatingFiles.clear()
        this.tempFileMapping.clear()
        this.tempFileEditors.clear()

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
