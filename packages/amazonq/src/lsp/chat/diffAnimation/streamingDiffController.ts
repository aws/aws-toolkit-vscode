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
                pairIndex?: number
                totalPairs?: number
            }
        }
    >()

    // **NEW: Track fsReplace sessions by file path to handle multiple diff pairs correctly**
    private fsReplaceSessionsByFile = new Map<
        string,
        {
            toolUseIds: Set<string>
            totalExpectedPairs: number
            completedPairs: number
            tempFilePath: string
            lastActivity: number
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

            // **NEW: Track fsReplace sessions by file path for proper cleanup**
            if (fsWriteParams?.command === 'fsReplace_diffPair') {
                const filePath = session.filePath
                const { totalPairs = 1 } = fsWriteParams

                if (!this.fsReplaceSessionsByFile.has(filePath)) {
                    this.fsReplaceSessionsByFile.set(filePath, {
                        toolUseIds: new Set([toolUseId]),
                        totalExpectedPairs: totalPairs,
                        completedPairs: 0,
                        tempFilePath: session.tempFilePath,
                        lastActivity: Date.now(),
                    })
                    getLogger().info(
                        `[StreamingDiffController] 📝 Created fsReplace session for ${filePath}: expecting ${totalPairs} pairs`
                    )
                } else {
                    // Add this toolUseId to existing session
                    const fsReplaceSession = this.fsReplaceSessionsByFile.get(filePath)!
                    fsReplaceSession.toolUseIds.add(toolUseId)
                    fsReplaceSession.lastActivity = Date.now()
                    getLogger().info(
                        `[StreamingDiffController] 📝 Added ${toolUseId} to existing fsReplace session for ${filePath}`
                    )
                }
            }
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

            // **NEW: Check if we already have a temp file for this file path (for fsReplace)**
            let tempFilePath: string
            let shouldCreateNewTempFile = true

            // Check if there's already an fsReplace session for this file
            const existingFsReplaceSession = this.fsReplaceSessionsByFile.get(filePath)
            if (existingFsReplaceSession) {
                tempFilePath = existingFsReplaceSession.tempFilePath
                shouldCreateNewTempFile = false
                getLogger().info(
                    `[StreamingDiffController] 🔄 Reusing existing temp file for fsReplace: ${tempFilePath}`
                )

                // Add this toolUseId to the existing session
                existingFsReplaceSession.toolUseIds.add(toolUseId)
                existingFsReplaceSession.lastActivity = Date.now()
            } else {
                // Create new temp file path
                tempFilePath = path.join(path.dirname(filePath), `.amazonq-temp-${toolUseId}-${fileName}`)
            }

            const tempFileUri = vscode.Uri.file(tempFilePath)

            // **KEY FIX**: Create virtual URI for original content (same as fsWrite)
            const originalUri = vscode.Uri.parse(`${diffViewUriScheme}:${fileName}`).with({
                query: Buffer.from(originalContent).toString('base64'),
            })

            // **STEP 1**: Create temporary file with original content for animation (if needed)
            if (shouldCreateNewTempFile) {
                await this.createTempFile(tempFilePath, originalContent)
            }

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
     * Stream content updates to temporary file for animation - handles different fsWrite and fsReplace operation types
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
            // **CRITICAL FIX: Handle fsReplace operations with diff pair approach**
            // Check both the session fsWriteParams and log the exact command value for debugging
            const command = session.fsWriteParams?.command
            getLogger().info(
                `[StreamingDiffController] 🔍 DEBUG: Checking command: "${command}" (type: ${typeof command})`
            )

            if (command === 'fsReplace_diffPair') {
                // **NEW APPROACH**: Handle individual diff pairs (like Cline's SEARCH/REPLACE blocks)
                getLogger().info(`[StreamingDiffController] 🔄 Processing fsReplace_diffPair phase`)
                await this.handleFsReplaceDiffPair(session, partialContent, isFinal)
                return
            } else if (command === 'fsReplace_completion') {
                // **CRITICAL FIX**: Handle final completion signal from parser
                getLogger().info(
                    `[StreamingDiffController] 🏁 Processing fsReplace_completion signal - triggering cleanup`
                )
                await this.handleFsReplaceCompletionSignal(session)
                return
            } else {
                getLogger().info(
                    `[StreamingDiffController] ⚠️ Command "${command}" does not match known fsReplace commands, falling back to default processing`
                )
            }

            // **EXISTING: Handle different fsWrite operation types correctly**
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
     * Handle fsReplace diffPair phase - individual diff pair animation (like Cline's SEARCH/REPLACE blocks)
     * **RACE CONDITION FIX**: Ensures the same temp file is reused for all diff pairs from the same toolUseId
     */
    async handleFsReplaceDiffPair(session: any, partialContent: string, isFinal: boolean): Promise<void> {
        getLogger().info(
            `[StreamingDiffController] 🔄 fsReplace diffPair phase: ${partialContent.length} chars (final: ${isFinal})`
        )

        try {
            const diffEditor = session.activeDiffEditor
            const document = diffEditor.document

            if (!diffEditor || !document) {
                throw new Error('User closed text editor, unable to edit file...')
            }

            // **RACE CONDITION FIX**: Add small delay to ensure document is ready for editing
            // This prevents race conditions when multiple small diff pairs arrive rapidly
            await new Promise((resolve) => setTimeout(resolve, 10))

            // Extract diff pair parameters from fsWriteParams (removed startLine - calculate dynamically)
            const { oldStr, newStr, pairIndex, totalPairs } = session.fsWriteParams || {}

            if (!oldStr || !newStr) {
                getLogger().warn(`[StreamingDiffController] ⚠️ Missing oldStr or newStr in diffPair parameters`)
                return
            }

            getLogger().info(
                `[StreamingDiffController] 🔄 Processing diff pair ${(pairIndex || 0) + 1}/${totalPairs || 1}: oldStr=${oldStr.length} chars, newStr=${newStr.length} chars`
            )

            // **CRITICAL FIX**: Get current document content from the SAME temp file
            // This ensures all diff pairs are applied to the same file progressively
            const currentContent = document.getText()

            // **RACE CONDITION FIX**: Verify the temp file path matches the session
            // This ensures we're always working with the correct temp file
            if (document.uri.fsPath !== session.tempFilePath) {
                getLogger().warn(
                    `[StreamingDiffController] ⚠️ Document path mismatch: expected ${session.tempFilePath}, got ${document.uri.fsPath}`
                )
                // Try to get the correct document
                try {
                    const correctDocument = await vscode.workspace.openTextDocument(
                        vscode.Uri.file(session.tempFilePath)
                    )
                    if (correctDocument) {
                        getLogger().info(
                            `[StreamingDiffController] ✅ Corrected document path to ${session.tempFilePath}`
                        )
                        // Update the session with the correct document
                        const correctEditor = vscode.window.visibleTextEditors.find(
                            (editor) => editor.document.uri.fsPath === session.tempFilePath
                        )
                        if (correctEditor) {
                            session.activeDiffEditor = correctEditor
                            // **FIX**: Don't recursively call - just update the references and continue
                            getLogger().info(
                                `[StreamingDiffController] ✅ Updated session with correct editor, continuing with diff pair processing`
                            )
                        }
                    }
                } catch (error) {
                    getLogger().error(`[StreamingDiffController] ❌ Failed to correct document path: ${error}`)
                    return // Exit if we can't get the correct document
                }
            }

            // Find the location of oldStr in the current content
            const oldStrIndex = currentContent.indexOf(oldStr)
            if (oldStrIndex === -1) {
                getLogger().warn(`[StreamingDiffController] ⚠️ Could not find oldStr in document for diff pair`)
                getLogger().warn(
                    `[StreamingDiffController] 🔍 DEBUG: Looking for oldStr (${oldStr.length} chars): "${oldStr.substring(0, 100)}..."`
                )
                getLogger().warn(
                    `[StreamingDiffController] 🔍 DEBUG: In document (${currentContent.length} chars): "${currentContent.substring(0, 200)}..."`
                )
                getLogger().warn(
                    `[StreamingDiffController] 🔍 DEBUG: Document ends with: "...${currentContent.substring(Math.max(0, currentContent.length - 100))}"`
                )
                return
            }

            // Calculate line numbers for the replacement
            const beforeOldStr = currentContent.substring(0, oldStrIndex)
            const startLineNumber = beforeOldStr.split('\n').length - 1
            const oldStrLines = oldStr.split('\n')
            const endLineNumber = startLineNumber + oldStrLines.length - 1

            // Scroll to the change location
            this.scrollEditorToLine(diffEditor, startLineNumber)

            // **STEP 1: Highlight and remove old content (deletion animation)**
            getLogger().info(
                `[StreamingDiffController] 🗑️ Animating deletion of oldStr at lines ${startLineNumber + 1}-${endLineNumber + 1}`
            )

            // Highlight the lines being deleted
            for (let lineNum = startLineNumber; lineNum <= endLineNumber; lineNum++) {
                session.activeLineController.setActiveLine(lineNum)
                await new Promise((resolve) => setTimeout(resolve, 50)) // Quick highlight
            }

            // **CRITICAL FIX**: Replace oldStr with newStr in the SAME temp file
            // This ensures all diff pairs are applied progressively to the same file
            const edit = new vscode.WorkspaceEdit()
            const oldStrStartPos = document.positionAt(oldStrIndex)
            const oldStrEndPos = document.positionAt(oldStrIndex + oldStr.length)
            const replaceRange = new vscode.Range(oldStrStartPos, oldStrEndPos)
            edit.replace(document.uri, replaceRange, newStr)
            await vscode.workspace.applyEdit(edit)

            // **STEP 2: Highlight new content (creation animation)**
            getLogger().info(`[StreamingDiffController] ➕ Animating creation of newStr`)

            // Calculate new line positions after replacement
            const newStrLines = newStr.split('\n')
            const newEndLineNumber = startLineNumber + newStrLines.length - 1

            // Highlight the new lines
            for (let lineNum = startLineNumber; lineNum <= newEndLineNumber; lineNum++) {
                session.activeLineController.setActiveLine(lineNum)
                session.fadedOverlayController.updateOverlayAfterLine(lineNum, document.lineCount)
                await new Promise((resolve) => setTimeout(resolve, 20)) // Animation delay
            }

            // Clear active line decoration after animation
            setTimeout(() => {
                session.activeLineController.clear()
            }, 500)

            // **ALWAYS SAVE**: Save the temp file after each diff pair to persist changes
            try {
                await document.save()
                getLogger().info(
                    `[StreamingDiffController] 💾 Saved diff pair ${(pairIndex || 0) + 1}/${totalPairs || 1} to temp file: ${session.tempFilePath}`
                )
                vscode.window.setStatusBarMessage(
                    `✅ Applied diff pair ${(pairIndex || 0) + 1}/${totalPairs || 1}: ${path.basename(session.filePath)}`,
                    1000
                )
            } catch (saveError) {
                getLogger().error(
                    `[StreamingDiffController] ❌ Failed to save fsReplace diffPair temp file: ${saveError}`
                )
            }

            // **CORRECTED CLEANUP LOGIC**: Only cleanup when the parser signals completion
            // The parser sets isFinal=true only when the entire fsReplace operation is complete
            if (isFinal) {
                getLogger().info(
                    `[StreamingDiffController] 🏁 Parser signaled completion (isFinal=true) for diff pair ${(pairIndex || 0) + 1}/${totalPairs || 1}, triggering cleanup`
                )
                await this.handleFsReplaceCompletion(session, pairIndex || 0, totalPairs || 1)
            } else {
                getLogger().info(
                    `[StreamingDiffController] ⚡ Diff pair ${(pairIndex || 0) + 1}/${totalPairs || 1} processed, waiting for completion signal (isFinal=false)`
                )
            }
        } catch (error) {
            getLogger().error(`[StreamingDiffController] ❌ Failed to handle fsReplace diffPair: ${error}`)
        }
    }

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
     * Handle fsReplace completion signal from parser - triggers immediate cleanup
     */
    private async handleFsReplaceCompletionSignal(session: any): Promise<void> {
        const filePath = session.filePath

        getLogger().info(
            `[StreamingDiffController] 🏁 Received fsReplace completion signal for ${filePath} - triggering immediate cleanup`
        )

        try {
            // Clear decorations immediately
            session.fadedOverlayController.clear()
            session.activeLineController.clear()

            // Save the temp file one final time
            const diffEditor = session.activeDiffEditor
            const document = diffEditor?.document
            if (document) {
                try {
                    await document.save()
                    getLogger().info(
                        `[StreamingDiffController] 💾 Final save completed for fsReplace temp file: ${session.tempFilePath}`
                    )
                } catch (saveError) {
                    getLogger().error(`[StreamingDiffController] ❌ Failed to save fsReplace temp file: ${saveError}`)
                }
            }

            // Show completion message
            vscode.window.setStatusBarMessage(`✅ fsReplace complete: ${path.basename(filePath)}`, 3000)

            // Schedule cleanup after a short delay
            setTimeout(async () => {
                try {
                    // Clean up temp file
                    await this.cleanupTempFile(session.tempFilePath)
                    getLogger().info(
                        `[StreamingDiffController] 🧹 Cleaned up fsReplace temp file: ${session.tempFilePath}`
                    )

                    // Mark session as disposed and remove it
                    session.disposed = true

                    // Find and remove all sessions for this file
                    const sessionsToRemove: string[] = []
                    for (const [toolUseId, sessionData] of this.activeStreamingSessions.entries()) {
                        if (sessionData.filePath === filePath) {
                            sessionsToRemove.push(toolUseId)
                        }
                    }

                    for (const toolUseId of sessionsToRemove) {
                        this.activeStreamingSessions.delete(toolUseId)
                        getLogger().info(`[StreamingDiffController] 🧹 Removed fsReplace session ${toolUseId}`)
                    }

                    // Clean up fsReplace session tracker
                    this.fsReplaceSessionsByFile.delete(filePath)
                    getLogger().info(
                        `[StreamingDiffController] 🧹 Cleaned up fsReplace session tracker for ${filePath}`
                    )
                } catch (error) {
                    getLogger().warn(
                        `[StreamingDiffController] ⚠️ Failed to cleanup fsReplace session for ${filePath}: ${error}`
                    )
                }
            }, 500) // Short delay to ensure all operations complete
        } catch (error) {
            getLogger().error(`[StreamingDiffController] ❌ Failed to handle fsReplace completion signal: ${error}`)
        }
    }

    /**
     * Handle fsReplace completion - properly track and cleanup when all diff pairs for a file are done
     */
    private async handleFsReplaceCompletion(session: any, pairIndex: number, totalPairs: number): Promise<void> {
        const filePath = session.filePath
        const fsReplaceSession = this.fsReplaceSessionsByFile.get(filePath)

        if (!fsReplaceSession) {
            getLogger().warn(`[StreamingDiffController] ⚠️ No fsReplace session found for ${filePath}`)
            return
        }

        // Increment completed pairs count
        fsReplaceSession.completedPairs++
        fsReplaceSession.lastActivity = Date.now()

        getLogger().info(
            `[StreamingDiffController] 📊 fsReplace progress for ${filePath}: ${fsReplaceSession.completedPairs}/${fsReplaceSession.totalExpectedPairs} pairs completed`
        )

        // Check if all expected diff pairs for this file are complete
        const allPairsComplete = fsReplaceSession.completedPairs >= fsReplaceSession.totalExpectedPairs
        const isLastPairInSequence = pairIndex === totalPairs - 1

        // **CORRECTED**: Only cleanup when we've truly completed all expected pairs for this file
        // AND this is the last pair in the current sequence
        if (allPairsComplete && isLastPairInSequence) {
            getLogger().info(
                `[StreamingDiffController] 🏁 All fsReplace diff pairs complete for ${filePath}, scheduling cleanup`
            )

            // Clear decorations
            session.fadedOverlayController.clear()
            session.activeLineController.clear()

            // Show final completion message
            vscode.window.setStatusBarMessage(
                `✅ fsReplace complete: ${fsReplaceSession.completedPairs} changes applied to ${path.basename(filePath)}`,
                3000
            )

            // **IMPROVED CLEANUP**: Clean up all sessions for this file after a delay
            setTimeout(async () => {
                try {
                    // Clean up temp file
                    await this.cleanupTempFile(fsReplaceSession.tempFilePath)
                    getLogger().info(
                        `[StreamingDiffController] 🧹 Cleaned up fsReplace temp file: ${fsReplaceSession.tempFilePath}`
                    )

                    // Remove all sessions associated with this file
                    for (const toolUseId of fsReplaceSession.toolUseIds) {
                        const sessionToCleanup = this.activeStreamingSessions.get(toolUseId)
                        if (sessionToCleanup) {
                            sessionToCleanup.disposed = true
                            this.activeStreamingSessions.delete(toolUseId)
                            getLogger().info(`[StreamingDiffController] 🧹 Removed fsReplace session ${toolUseId}`)
                        }
                    }

                    // Remove the fsReplace session tracker
                    this.fsReplaceSessionsByFile.delete(filePath)
                    getLogger().info(
                        `[StreamingDiffController] 🧹 Cleaned up fsReplace session tracker for ${filePath}`
                    )
                } catch (error) {
                    getLogger().warn(
                        `[StreamingDiffController] ⚠️ Failed to cleanup fsReplace session for ${filePath}: ${error}`
                    )
                }
            }, 1000) // 1 second delay to ensure all operations complete
        } else {
            getLogger().info(
                `[StreamingDiffController] ⚡ fsReplace diff pair ${pairIndex + 1}/${totalPairs} completed, waiting for more pairs`
            )
        }
    }

    /**
     * Clean up all temporary files for a chat session
     */
    async cleanupChatSession(): Promise<void> {
        const tempFilesToCleanup: string[] = []

        // Collect temp files from regular sessions
        for (const [, session] of this.activeStreamingSessions.entries()) {
            if (session.tempFilePath) {
                tempFilesToCleanup.push(session.tempFilePath)
            }
        }

        // Collect temp files from fsReplace sessions
        for (const [, fsReplaceSession] of this.fsReplaceSessionsByFile.entries()) {
            if (fsReplaceSession.tempFilePath) {
                tempFilesToCleanup.push(fsReplaceSession.tempFilePath)
            }
        }

        // Clean up all temp files
        for (const tempFilePath of tempFilesToCleanup) {
            try {
                await this.cleanupTempFile(tempFilePath)
            } catch (error) {
                getLogger().warn(`[StreamingDiffController] ⚠️ Failed to cleanup temp file ${tempFilePath}: ${error}`)
            }
        }

        // Clear fsReplace session trackers
        this.fsReplaceSessionsByFile.clear()
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
