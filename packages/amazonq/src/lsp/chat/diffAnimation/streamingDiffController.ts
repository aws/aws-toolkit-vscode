/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from 'aws-core-vscode/shared'

export const diffViewUriScheme = 'amazonq-diff'

/**
 * Streaming Diff Controller using temporary files for animations
 *
 * Opens VSCode's native diff view between original content (virtual) and temporary file (for animation)
 * Streams content to temporary file for animation while keeping real file operations separate
 * This prevents conflicts with actual fsWrite operations and +X -Y calculations
 */
export class StreamingDiffController implements vscode.Disposable {
    private activeStreamingSessions = new Map<
        string,
        {
            filePath: string
            tempFilePath: string
            originalContent: string
            activeDiffEditor: vscode.TextEditor
            fadedOverlayController: DecorationController
            activeLineController: DecorationController
            streamedLines: string[]
            disposed: boolean
            // **KEY FIX: Store fsWrite operation parameters for correct region calculation**
            fsWriteParams?: {
                command?: string
                insertLine?: number
                oldStr?: string
                newStr?: string
                fileText?: string
                explanation?: string
            }
        }
    >()

    private contentProvider: DiffContentProvider

    constructor() {
        getLogger().info('[StreamingDiffController] 🚀 Initializing Cline-style streaming diff controller')

        // Register content provider for diff view (like Cline's approach)
        this.contentProvider = new DiffContentProvider()
        vscode.workspace.registerTextDocumentContentProvider(diffViewUriScheme, this.contentProvider)
    }

    /**
     * Update fsWrite parameters for a streaming session to enable correct region animation
     */
    updateFsWriteParams(toolUseId: string, fsWriteParams: any): void {
        const session = this.activeStreamingSessions.get(toolUseId)
        if (session) {
            session.fsWriteParams = fsWriteParams
            getLogger().info(
                `[StreamingDiffController] 📝 Updated fsWrite params for ${toolUseId}: command=${fsWriteParams?.command}, insertLine=${fsWriteParams?.insertLine}`
            )
        }
    }

    /**
     * Opens diff view using virtual original content vs temp file for animation (like fsWrite)
     * **CRITICAL FIX**: Use virtual URI vs temp file (same as fsWrite) for proper diff decorations
     */
    async openStreamingDiffView(toolUseId: string, filePath: string, originalContent: string): Promise<void> {
        getLogger().info(
            `[StreamingDiffController] 🎬 Opening streaming diff view for ${filePath} (toolUse: ${toolUseId})`
        )

        try {
            const fileName = path.basename(filePath)

            // **CRITICAL FIX**: Create temporary file for animation
            const tempFilePath = path.join(path.dirname(filePath), `.amazonq-temp-${toolUseId}-${fileName}`)
            const tempFileUri = vscode.Uri.file(tempFilePath)

            // **KEY FIX**: Create virtual URI for original content (same as fsWrite)
            const originalUri = vscode.Uri.parse(`${diffViewUriScheme}:${fileName}`).with({
                query: Buffer.from(originalContent).toString('base64'),
            })

            // **STEP 1**: Create temporary file with original content for animation
            await this.createTempFile(tempFilePath, originalContent)

            // **CRITICAL FIX**: Open diff view between virtual original and temp file (same as fsWrite)
            const activeDiffEditor = await new Promise<vscode.TextEditor>((resolve, reject) => {
                const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
                    if (editor && editor.document.uri.fsPath === tempFilePath) {
                        disposable.dispose()
                        resolve(editor)
                    }
                })

                void vscode.commands.executeCommand(
                    'vscode.diff',
                    originalUri, // **FIXED**: Use virtual URI (same as fsWrite)
                    tempFileUri,
                    `${fileName}: Original ↔ Amazon Q Changes (Animation Preview)`,
                    {
                        preserveFocus: true,
                        preview: false,
                    }
                )

                // Timeout after 10 seconds
                setTimeout(() => {
                    disposable.dispose()
                    reject(new Error('Failed to open diff editor within timeout'))
                }, 10000)
            })

            // **KEY ENHANCEMENT: Configure VSCode's diff editor settings for ALL operations**
            await this.configureDiffEditorSettings(activeDiffEditor)

            // Initialize decorations for animation
            const fadedOverlayController = new DecorationController('fadedOverlay', activeDiffEditor)
            const activeLineController = new DecorationController('activeLine', activeDiffEditor)

            // Apply faded overlay to all lines initially
            fadedOverlayController.addLines(0, activeDiffEditor.document.lineCount)

            // Store the streaming session with temp file path
            this.activeStreamingSessions.set(toolUseId, {
                filePath,
                tempFilePath,
                originalContent,
                activeDiffEditor,
                fadedOverlayController,
                activeLineController,
                streamedLines: [],
                disposed: false,
            })

            // Show status message
            vscode.window.setStatusBarMessage(`🎬 Streaming animation preview for ${fileName}...`, 5000)

            getLogger().info(`[StreamingDiffController] ✅ Streaming diff view opened with temp file for ${toolUseId}`)
        } catch (error) {
            getLogger().error(`[StreamingDiffController] ❌ Failed to open diff view for ${toolUseId}: ${error}`)
            throw error
        }
    }

    /**
     * Stream content updates to temporary file for animation - handles different fsWrite operation types
     */
    async streamContentUpdate(toolUseId: string, partialContent: string, isFinal: boolean = false): Promise<void> {
        const session = this.activeStreamingSessions.get(toolUseId)

        if (!session || session.disposed) {
            getLogger().warn(`[StreamingDiffController] ⚠️ No active streaming session for ${toolUseId}`)
            return
        }

        getLogger().info(
            `[StreamingDiffController] ⚡ Streaming animation update for ${toolUseId}: ${partialContent.length} chars (final: ${isFinal}) command: ${session.fsWriteParams?.command}`
        )

        try {
            // **KEY FIX: Handle different fsWrite operation types correctly**
            let contentToAnimate = partialContent

            if (session.fsWriteParams?.command === 'strReplace' && session.fsWriteParams.oldStr) {
                // **CRITICAL FIX: For strReplace, show the result of the replacement in context**
                // Instead of just showing newStr, show the full file content with the replacement applied
                getLogger().info(
                    `[StreamingDiffController] 🔄 Processing strReplace operation: replacing "${session.fsWriteParams.oldStr.substring(0, 50)}..." with "${partialContent.substring(0, 50)}..."`
                )

                // Apply the replacement to the original content to show the full result
                try {
                    contentToAnimate = session.originalContent.replace(session.fsWriteParams.oldStr, partialContent)
                    getLogger().info(
                        `[StreamingDiffController] ✅ strReplace result: ${contentToAnimate.length} chars (was ${session.originalContent.length} chars)`
                    )
                } catch (error) {
                    getLogger().warn(
                        `[StreamingDiffController] ⚠️ Failed to apply strReplace, using partial content: ${error}`
                    )
                    contentToAnimate = partialContent
                }
            } else if (session.fsWriteParams?.command === 'insert' && session.fsWriteParams.insertLine !== undefined) {
                // **Handle insert operations - insert content after specific line**
                getLogger().info(
                    `[StreamingDiffController] 📝 Processing insert operation at line ${session.fsWriteParams.insertLine}`
                )
                try {
                    const originalLines = session.originalContent.split('\n')
                    const insertLine = Math.max(0, Math.min(session.fsWriteParams.insertLine, originalLines.length))

                    // Insert the new content after the specified line
                    const beforeLines = originalLines.slice(0, insertLine)
                    const afterLines = originalLines.slice(insertLine)

                    contentToAnimate = [...beforeLines, partialContent, ...afterLines].join('\n')
                    getLogger().info(
                        `[StreamingDiffController] ✅ Insert result: ${contentToAnimate.length} chars (was ${session.originalContent.length} chars)`
                    )
                } catch (error) {
                    getLogger().warn(
                        `[StreamingDiffController] ⚠️ Failed to apply insert, using partial content: ${error}`
                    )
                    contentToAnimate = partialContent
                }
            } else if (session.fsWriteParams?.command === 'append') {
                // **Handle append operations - add content to end of file**
                getLogger().info(`[StreamingDiffController] ➕ Processing append operation`)
                try {
                    // Add content to the end of the original file
                    const needsNewline = session.originalContent.length !== 0 && !session.originalContent.endsWith('\n')
                    contentToAnimate = session.originalContent + (needsNewline ? '\n' : '') + partialContent
                    getLogger().info(
                        `[StreamingDiffController] ✅ Append result: ${contentToAnimate.length} chars (was ${session.originalContent.length} chars)`
                    )
                } catch (error) {
                    getLogger().warn(
                        `[StreamingDiffController] ⚠️ Failed to apply append, using partial content: ${error}`
                    )
                    contentToAnimate = partialContent
                }
            } else if (session.fsWriteParams?.command === 'create') {
                // **Handle create operations - replace entire file content**
                getLogger().info(`[StreamingDiffController] 🆕 Processing create operation`)
                contentToAnimate = partialContent
            } else {
                // **Default: use partial content as-is**
                getLogger().info(
                    `[StreamingDiffController] 📄 Processing default operation (command: ${session.fsWriteParams?.command || 'unknown'})`
                )
                contentToAnimate = partialContent
            }

            // Split content into lines
            const accumulatedLines = contentToAnimate.split('\n')
            if (!isFinal) {
                accumulatedLines.pop() // remove the last partial line only if it's not the final update
            }

            const diffEditor = session.activeDiffEditor
            const document = diffEditor.document

            if (!diffEditor || !document) {
                throw new Error('User closed text editor, unable to edit file...')
            }

            // **KEY CHANGE**: We're updating the TEMPORARY file for animation
            // The real file operations happen separately via the normal fsWrite process

            // Place cursor at the beginning
            const beginningOfDocument = new vscode.Position(0, 0)
            diffEditor.selection = new vscode.Selection(beginningOfDocument, beginningOfDocument)

            // **CRITICAL FIX**: Edit line by line, not from start of file
            // Process only new lines that haven't been streamed yet
            const newLines = accumulatedLines.slice(session.streamedLines.length)

            for (let i = 0; i < newLines.length; i++) {
                const lineIndex = session.streamedLines.length + i
                const lineContent = newLines[i]

                // **LINE-BY-LINE EDIT**: Insert/replace only the current line
                const edit = new vscode.WorkspaceEdit()

                if (lineIndex < document.lineCount) {
                    // Replace existing line
                    const lineRange = new vscode.Range(lineIndex, 0, lineIndex, document.lineAt(lineIndex).text.length)
                    edit.replace(document.uri, lineRange, lineContent)
                } else {
                    // Insert new line at the end
                    const insertPosition = new vscode.Position(document.lineCount, 0)
                    const contentToInsert = (lineIndex > 0 ? '\n' : '') + lineContent
                    edit.insert(document.uri, insertPosition, contentToInsert)
                }

                await vscode.workspace.applyEdit(edit)

                // Update decorations for current line
                session.activeLineController.setActiveLine(lineIndex)
                session.fadedOverlayController.updateOverlayAfterLine(lineIndex, document.lineCount)

                // Scroll to show changes
                this.scrollEditorToLine(diffEditor, lineIndex)

                // Add small delay for animation effect
                await new Promise((resolve) => setTimeout(resolve, 50))
            }

            // Update streamed lines
            session.streamedLines = accumulatedLines

            if (isFinal) {
                getLogger().info(`[StreamingDiffController] 🏁 Animation complete for ${toolUseId}`)

                // Handle remaining lines if content is shorter
                if (session.streamedLines.length < document.lineCount) {
                    const edit = new vscode.WorkspaceEdit()
                    edit.delete(document.uri, new vscode.Range(session.streamedLines.length, 0, document.lineCount, 0))
                    await vscode.workspace.applyEdit(edit)
                }

                // **CLEAN LOGIC**: Save temporary file
                try {
                    await document.save()
                    getLogger().info(
                        `[StreamingDiffController] 💾 Animation preview saved to temp file: ${session.tempFilePath}`
                    )
                    vscode.window.setStatusBarMessage(
                        `✅ Animation preview complete: ${path.basename(session.filePath)}`,
                        3000
                    )
                } catch (saveError) {
                    getLogger().error(
                        `[StreamingDiffController] ❌ Failed to save temp file ${session.tempFilePath}: ${saveError}`
                    )
                }

                // Clear decorations
                session.fadedOverlayController.clear()
                session.activeLineController.clear()

                // **NEW CLEAN LOGIC**: Auto-cleanup temp file after 2 seconds
                getLogger().info(
                    `[StreamingDiffController] ⏰ Scheduling temp file cleanup in 2 seconds: ${session.tempFilePath}`
                )
                setTimeout(async () => {
                    try {
                        await this.cleanupTempFile(session.tempFilePath)
                        getLogger().info(`[StreamingDiffController] 🧹 Auto-cleaned temp file: ${session.tempFilePath}`)

                        // Mark session as disposed after cleanup
                        session.disposed = true
                        this.activeStreamingSessions.delete(toolUseId)
                    } catch (error) {
                        getLogger().warn(
                            `[StreamingDiffController] ⚠️ Failed to auto-cleanup temp file ${session.tempFilePath}: ${error}`
                        )
                    }
                }, 2000) // 2 seconds delay
            }
        } catch (error) {
            getLogger().error(
                `[StreamingDiffController] ❌ Failed to stream animation update for ${toolUseId}: ${error}`
            )
        }
    }

    /**
     * METHOD 2: Force diff computation by toggling diff options
     */
    private async forceDiffRefreshByOptions(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('diffEditor')
            const currentIgnoreTrimWhitespace = config.get('ignoreTrimWhitespace')

            // Toggle setting to force recomputation
            await config.update(
                'ignoreTrimWhitespace',
                !currentIgnoreTrimWhitespace,
                vscode.ConfigurationTarget.Workspace
            )
            await new Promise((resolve) => setTimeout(resolve, 50))
            await config.update(
                'ignoreTrimWhitespace',
                currentIgnoreTrimWhitespace,
                vscode.ConfigurationTarget.Workspace
            )

            getLogger().debug(`[StreamingDiffController] 🔄 Forced diff refresh by toggling ignoreTrimWhitespace`)
        } catch (error) {
            getLogger().warn(`[StreamingDiffController] ⚠️ Failed to force diff refresh: ${error}`)
        }
    }

    /**
     * Configure VSCode's diff editor settings for better focus on changed regions
     */
    private async configureDiffEditorSettings(editor: vscode.TextEditor): Promise<void> {
        try {
            getLogger().info(`[StreamingDiffController] 🎯 Configuring diff editor settings for focused editing`)

            // **KEY ENHANCEMENT: Enable VSCode's hideUnchangedRegions feature**
            const config = vscode.workspace.getConfiguration('diffEditor')

            // Store original settings to restore later if needed

            // **Configure optimal settings for ALL fsWrite operations**
            await config.update('hideUnchangedRegions.enabled', true, vscode.ConfigurationTarget.Global)
            await config.update('hideUnchangedRegions.contextLineCount', 10, vscode.ConfigurationTarget.Global) // Show 3 lines of context
            await config.update('hideUnchangedRegions.minimumLineCount', 5, vscode.ConfigurationTarget.Global) // Collapse if 5+ unchanged lines
            await config.update('hideUnchangedRegions.revealLineCount', 10, vscode.ConfigurationTarget.Global) // Reveal 10 lines when expanding

            getLogger().info(
                `[StreamingDiffController] ✅ Configured diff editor settings: hideUnchangedRegions + inline view for focused editing`
            )

            // **Auto-collapse unchanged regions after a short delay to let the diff view load**
            setTimeout(async () => {
                try {
                    await vscode.commands.executeCommand('diffEditor.collapseAllUnchangedRegions')
                    getLogger().info(`[StreamingDiffController] 🎯 Auto-collapsed unchanged regions for focused view`)
                } catch (error) {
                    getLogger().warn(`[StreamingDiffController] ⚠️ Failed to auto-collapse unchanged regions: ${error}`)
                }
            }, 1000) // Wait 1 second for diff view to fully load
        } catch (error) {
            getLogger().warn(`[StreamingDiffController] ⚠️ Failed to configure diff editor settings: ${error}`)
        }
    }

    /**
     * Create temporary file for animation
     */
    private async createTempFile(tempFilePath: string, initialContent: string): Promise<void> {
        try {
            const edit = new vscode.WorkspaceEdit()
            edit.createFile(vscode.Uri.file(tempFilePath), { overwrite: true })
            await vscode.workspace.applyEdit(edit)

            // Write initial content to temp file
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(tempFilePath))
            const fullEdit = new vscode.WorkspaceEdit()
            fullEdit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), initialContent)
            await vscode.workspace.applyEdit(fullEdit)

            await document.save()
            getLogger().info(`[StreamingDiffController] ✅ Created temp file for animation: ${tempFilePath}`)
        } catch (error) {
            getLogger().error(`[StreamingDiffController] ❌ Failed to create temp file ${tempFilePath}: ${error}`)
            throw error
        }
    }

    /**
     * Clean up temporary file after animation
     */
    private async cleanupTempFile(tempFilePath: string): Promise<void> {
        try {
            const edit = new vscode.WorkspaceEdit()
            edit.deleteFile(vscode.Uri.file(tempFilePath), { ignoreIfNotExists: true })
            await vscode.workspace.applyEdit(edit)
        } catch (error) {
            getLogger().warn(`[StreamingDiffController] ⚠️ Failed to cleanup temp file ${tempFilePath}: ${error}`)
        }
    }

    /**
     * Scroll editor to line like Cline
     */
    private scrollEditorToLine(editor: vscode.TextEditor, line: number): void {
        const scrollLine = line
        editor.revealRange(new vscode.Range(scrollLine, 0, scrollLine, 0), vscode.TextEditorRevealType.InCenter)
    }

    /**
     * Process fsReplace complete event using temporary file diff view (like fsWrite)
     * **FIXED**: Now uses temp file to show proper red/green diff decorations
     */
    async processFsReplaceComplete(fsReplaceComplete: {
        toolUseId: string
        filePath: string
        diffString: string
        timestamp: number
    }): Promise<void> {
        // **CRITICAL FIX**: Check if session was cancelled by stop button
        const session = this.activeStreamingSessions.get(fsReplaceComplete.toolUseId)
        if (session && session.disposed) {
            getLogger().info(
                `[StreamingDiffController] 🛑 fsReplace session ${fsReplaceComplete.toolUseId} was cancelled, skipping animation`
            )
            return
        }
        try {
            getLogger().info(
                `[StreamingDiffController] 🔄 Processing fsReplace complete: ${fsReplaceComplete.filePath} (${fsReplaceComplete.diffString.length} chars)`
            )

            // **NEW: Parse structured diffs from JSON format**
            let structuredDiffs: Array<{ oldStr: string; newStr: string }> = []
            try {
                const parsedDiff = JSON.parse(fsReplaceComplete.diffString)
                if (parsedDiff.type === 'structured_diffs' && Array.isArray(parsedDiff.diffs)) {
                    structuredDiffs = parsedDiff.diffs
                    getLogger().info(
                        `[StreamingDiffController] ✅ Parsed ${structuredDiffs.length} structured diffs from LSP`
                    )
                } else {
                    throw new Error('Invalid structured diff format')
                }
            } catch (error) {
                getLogger().warn(
                    `[StreamingDiffController] ⚠️ Failed to parse structured diffs, falling back to line-by-line: ${error}`
                )
                // **FALLBACK: Handle old line-by-line format for backward compatibility**
                const diffLines = fsReplaceComplete.diffString.split('\n')
                for (let i = 0; i < diffLines.length; i += 2) {
                    const oldLine = diffLines[i]
                    const newLine = diffLines[i + 1]
                    if (oldLine && oldLine.startsWith('-') && newLine && newLine.startsWith('+')) {
                        structuredDiffs.push({
                            oldStr: oldLine.substring(1), // Remove '-' prefix
                            newStr: newLine.substring(1), // Remove '+' prefix
                        })
                    }
                }
            }

            if (structuredDiffs.length === 0) {
                getLogger().warn(`[StreamingDiffController] ⚠️ No valid diffs found to process`)
                return
            }

            // **KEY FIX: Use temp file approach like fsWrite to show proper diff decorations**
            const uri = vscode.Uri.file(fsReplaceComplete.filePath)
            let originalDocument: vscode.TextDocument

            try {
                originalDocument = await vscode.workspace.openTextDocument(uri)
            } catch (error) {
                getLogger().error(`[StreamingDiffController] ❌ Failed to open original document: ${error}`)
                return
            }

            const originalContent = originalDocument.getText()
            const fileName = path.basename(fsReplaceComplete.filePath)

            // **CRITICAL FIX: Create temporary file for animation (like fsWrite)**
            const tempFilePath = path.join(
                path.dirname(fsReplaceComplete.filePath),
                `.amazonq-temp-${fsReplaceComplete.toolUseId}-${fileName}`
            )
            const tempFileUri = vscode.Uri.file(tempFilePath)

            // Create virtual URI for original content
            const originalUri = vscode.Uri.parse(`${diffViewUriScheme}:${fileName}`).with({
                query: Buffer.from(originalContent).toString('base64'),
            })

            // **STEP 1: Create temp file with original content**
            await this.createTempFile(tempFilePath, originalContent)

            // **STEP 2: Apply all diffs to create final content**
            let finalContent = originalContent
            for (const { oldStr, newStr } of structuredDiffs) {
                finalContent = finalContent.replace(oldStr, newStr)
            }

            // **STEP 3: Open diff view between original (virtual) and temp file**
            const activeDiffEditor = await new Promise<vscode.TextEditor>((resolve, reject) => {
                const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
                    if (editor && editor.document.uri.fsPath === tempFilePath) {
                        disposable.dispose()
                        resolve(editor)
                    }
                })

                void vscode.commands.executeCommand(
                    'vscode.diff',
                    originalUri,
                    tempFileUri,
                    `${fileName}: Original ↔ Amazon Q fsReplace Changes`,
                    {
                        preserveFocus: true,
                        preview: false,
                    }
                )

                // Timeout after 10 seconds
                setTimeout(() => {
                    disposable.dispose()
                    reject(new Error('Failed to open diff editor within timeout'))
                }, 10000)
            })

            // **STEP 4: Configure diff editor settings**
            await this.configureDiffEditorSettings(activeDiffEditor)

            // Initialize decoration controllers
            const activeLineController = new DecorationController('activeLine', activeDiffEditor)
            const fadedOverlayController = new DecorationController('fadedOverlay', activeDiffEditor)

            // Apply faded overlay to all lines initially
            fadedOverlayController.addLines(0, activeDiffEditor.document.lineCount)

            try {
                // CRITICAL FIX: Instead of progressive building, use line-by-line updates
                // This forces VSCode to recalculate diffs incrementally

                const originalLines = originalContent.split('\n')
                const finalLines = finalContent.split('\n')

                // Find all line indices that have changes
                const changedLineIndices: number[] = []
                const maxLines = Math.max(originalLines.length, finalLines.length)

                for (let i = 0; i < maxLines; i++) {
                    const origLine = originalLines[i] || ''
                    const finalLine = finalLines[i] || ''
                    if (origLine !== finalLine) {
                        changedLineIndices.push(i)
                    }
                }

                getLogger().info(
                    `[StreamingDiffController] 🎬 Starting fsReplace animation: ${changedLineIndices.length} changed lines to animate`
                )

                // Scroll to first change
                if (changedLineIndices.length > 0) {
                    const firstChange = changedLineIndices[0]
                    activeDiffEditor.revealRange(
                        new vscode.Range(firstChange, 0, firstChange, 0),
                        vscode.TextEditorRevealType.InCenter
                    )
                }

                // APPROACH 1: Animate each changed line individually
                // This ensures VSCode recalculates diffs for each change
                for (let i = 0; i < changedLineIndices.length; i++) {
                    const lineIndex = changedLineIndices[i]
                    const finalLine = finalLines[lineIndex] || ''

                    getLogger().info(
                        `[StreamingDiffController] 🔄 Animating changed line ${lineIndex + 1}: "${finalLine.substring(0, 30)}..."`
                    )

                    // Set active line decoration
                    activeLineController.setActiveLine(lineIndex)

                    // CRITICAL: Update just this specific line
                    const edit = new vscode.WorkspaceEdit()

                    if (lineIndex < activeDiffEditor.document.lineCount) {
                        // Replace existing line
                        const currentLine = activeDiffEditor.document.lineAt(lineIndex)
                        edit.replace(tempFileUri, currentLine.range, finalLine)
                    } else {
                        // Add new line
                        const insertPos = new vscode.Position(activeDiffEditor.document.lineCount, 0)
                        const prefix = activeDiffEditor.document.lineCount > 0 ? '\n' : ''
                        edit.insert(tempFileUri, insertPos, prefix + finalLine)
                    }

                    await vscode.workspace.applyEdit(edit)

                    // Update overlay
                    fadedOverlayController.updateOverlayAfterLine(lineIndex, activeDiffEditor.document.lineCount)

                    // Scroll to current change
                    this.scrollEditorToLine(activeDiffEditor, lineIndex)

                    // Animation delay - can be adjusted based on preference
                    await new Promise((resolve) => setTimeout(resolve, 100))

                    // METHOD 2: Force VSCode to update the diff view by toggling diff options
                    // This forces diff recomputation and ensures decorations appear immediately
                    await this.forceDiffRefreshByOptions()
                }

                // Ensure final content is correct
                const finalEdit = new vscode.WorkspaceEdit()
                const fullRange = new vscode.Range(0, 0, activeDiffEditor.document.lineCount, 0)
                finalEdit.replace(tempFileUri, fullRange, finalContent)
                await vscode.workspace.applyEdit(finalEdit)
                await activeDiffEditor.document.save()

                getLogger().info(
                    `[StreamingDiffController] 🎬 fsReplace animation complete: ${changedLineIndices.length} changes animated`
                )

                // Clear decorations after animation
                setTimeout(() => {
                    activeLineController.clear()
                    fadedOverlayController.clear()
                }, 1000)

                // Show completion status
                vscode.window.setStatusBarMessage(
                    `✅ fsReplace animation complete: ${fileName} (${structuredDiffs.length} changes)`,
                    5000
                )

                // Auto-cleanup temp file
                setTimeout(async () => {
                    try {
                        await this.cleanupTempFile(tempFilePath)
                        getLogger().info(
                            `[StreamingDiffController] 🧹 Auto-cleaned fsReplace temp file: ${tempFilePath}`
                        )
                    } catch (error) {
                        getLogger().warn(`[StreamingDiffController] ⚠️ Failed to cleanup fsReplace temp file: ${error}`)
                    }
                }, 5000)
            } catch (animationError) {
                getLogger().error(`[StreamingDiffController] ❌ Failed during fsReplace animation: ${animationError}`)
                await this.cleanupTempFile(tempFilePath)
            }
        } catch (error) {
            getLogger().error(`[StreamingDiffController] ❌ Failed to process fsReplace complete: ${error}`)
        }
    }

    /**
     * Checks if streaming is active
     */
    isStreamingActive(toolUseId: string): boolean {
        const session = this.activeStreamingSessions.get(toolUseId)
        return session !== undefined && !session.disposed
    }

    /**
     * Get streaming stats
     */
    getStreamingStats(toolUseId: string): { isActive: boolean; contentLength: number } | undefined {
        const session = this.activeStreamingSessions.get(toolUseId)
        if (!session) {
            return undefined
        }

        return {
            isActive: this.isStreamingActive(toolUseId),
            contentLength: session.streamedLines.join('\n').length,
        }
    }

    /**
     * Close streaming session
     */
    async closeDiffView(toolUseId: string): Promise<void> {
        const session = this.activeStreamingSessions.get(toolUseId)
        if (!session) {
            return
        }

        getLogger().info(`[StreamingDiffController] 🚪 Closing streaming session for ${toolUseId}`)

        try {
            session.disposed = true
            session.fadedOverlayController.clear()
            session.activeLineController.clear()

            // Clean up temp file immediately when session is closed
            if (session.tempFilePath) {
                await this.cleanupTempFile(session.tempFilePath)
                getLogger().info(
                    `[StreamingDiffController] 🧹 Cleaned up temp file on session close: ${session.tempFilePath}`
                )
            }

            this.activeStreamingSessions.delete(toolUseId)

            getLogger().info(`[StreamingDiffController] ✅ Closed streaming session for ${toolUseId}`)
        } catch (error) {
            getLogger().error(
                `[StreamingDiffController] ❌ Failed to close streaming session for ${toolUseId}: ${error}`
            )
        }
    }

    /**
     * Clean up all temporary files for a chat session
     */
    async cleanupChatSession(): Promise<void> {
        const tempFilesToCleanup: string[] = []

        for (const [, session] of this.activeStreamingSessions.entries()) {
            if (session.tempFilePath) {
                tempFilesToCleanup.push(session.tempFilePath)
            }
        }

        for (const tempFilePath of tempFilesToCleanup) {
            try {
                await this.cleanupTempFile(tempFilePath)
            } catch (error) {
                getLogger().warn(`[StreamingDiffController] ⚠️ Failed to cleanup temp file ${tempFilePath}: ${error}`)
            }
        }
    }

    /**
     * Dispose all resources
     */
    dispose(): void {
        void this.cleanupChatSession()

        for (const [toolUseId, session] of this.activeStreamingSessions.entries()) {
            try {
                session.disposed = true
                session.fadedOverlayController.clear()
                session.activeLineController.clear()
            } catch (error) {
                getLogger().error(`[StreamingDiffController] ❌ Error disposing session ${toolUseId}: ${error}`)
            }
        }

        this.activeStreamingSessions.clear()
    }
}

/**
 * Simple content provider like Cline's - returns original content from base64 query
 */
class DiffContentProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
        try {
            // Decode base64 content from query like Cline
            return Buffer.from(uri.query, 'base64').toString('utf8')
        } catch {
            return ''
        }
    }
}

/**
 * Decoration Controller exactly like Cline's implementation
 */
const fadedOverlayDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 0, 0.1)',
    opacity: '0.4',
    isWholeLine: true,
})

const activeLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 0, 0.3)',
    opacity: '1',
    isWholeLine: true,
    border: '1px solid rgba(255, 255, 0, 0.5)',
})

type DecorationType = 'fadedOverlay' | 'activeLine'

class DecorationController {
    private decorationType: DecorationType
    private editor: vscode.TextEditor
    private ranges: vscode.Range[] = []

    constructor(decorationType: DecorationType, editor: vscode.TextEditor) {
        this.decorationType = decorationType
        this.editor = editor
    }

    getDecoration() {
        switch (this.decorationType) {
            case 'fadedOverlay':
                return fadedOverlayDecorationType
            case 'activeLine':
                return activeLineDecorationType
        }
    }

    addLines(startIndex: number, numLines: number) {
        // Guard against invalid inputs
        if (startIndex < 0 || numLines <= 0) {
            return
        }

        const lastRange = this.ranges[this.ranges.length - 1]
        if (lastRange && lastRange.end.line === startIndex - 1) {
            this.ranges[this.ranges.length - 1] = lastRange.with(undefined, lastRange.end.translate(numLines))
        } else {
            const endLine = startIndex + numLines - 1
            this.ranges.push(new vscode.Range(startIndex, 0, endLine, Number.MAX_SAFE_INTEGER))
        }

        this.editor.setDecorations(this.getDecoration(), this.ranges)
    }

    clear() {
        this.ranges = []
        this.editor.setDecorations(this.getDecoration(), this.ranges)
    }

    updateOverlayAfterLine(line: number, totalLines: number) {
        // Remove any existing ranges that start at or after the current line
        this.ranges = this.ranges.filter((range) => range.end.line < line)

        // Add a new range for all lines after the current line
        if (line < totalLines - 1) {
            this.ranges.push(
                new vscode.Range(
                    new vscode.Position(line + 1, 0),
                    new vscode.Position(totalLines - 1, Number.MAX_SAFE_INTEGER)
                )
            )
        }

        // Apply the updated decorations
        this.editor.setDecorations(this.getDecoration(), this.ranges)
    }

    setActiveLine(line: number) {
        this.ranges = [new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)]
        this.editor.setDecorations(this.getDecoration(), this.ranges)
    }
}
