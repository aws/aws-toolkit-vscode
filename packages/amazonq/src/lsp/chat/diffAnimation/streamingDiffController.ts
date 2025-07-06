/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from 'aws-core-vscode/shared'

export const diffViewUriScheme = 'amazonq-diff'

/**
 * Streaming Diff Controller using Cline's exact approach
 *
 * Opens VSCode's native diff view between original content (virtual) and actual file (real)
 * Streams content directly to the actual file with yellow line animations
 */
export class StreamingDiffController implements vscode.Disposable {
    private activeStreamingSessions = new Map<
        string,
        {
            filePath: string
            originalContent: string
            activeDiffEditor: vscode.TextEditor
            fadedOverlayController: DecorationController
            activeLineController: DecorationController
            streamedLines: string[]
            disposed: boolean
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
     * Opens diff view exactly like Cline: original content (virtual) vs actual file (real)
     */
    async openStreamingDiffView(toolUseId: string, filePath: string, originalContent: string): Promise<void> {
        getLogger().info(
            `[StreamingDiffController] 🎬 Opening Cline-style diff view for ${filePath} (toolUse: ${toolUseId})`
        )

        try {
            const fileName = path.basename(filePath)
            const fileUri = vscode.Uri.file(filePath)

            // Create virtual URI for original content (like Cline's cline-diff: scheme)
            const originalUri = vscode.Uri.parse(`${diffViewUriScheme}:${fileName}`).with({
                query: Buffer.from(originalContent).toString('base64'),
            })

            // Open the actual file first and ensure it exists
            await this.ensureFileExists(filePath, originalContent)

            // Open VSCode's native diff view (original virtual vs actual file)
            const activeDiffEditor = await new Promise<vscode.TextEditor>((resolve, reject) => {
                const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
                    if (editor && editor.document.uri.fsPath === filePath) {
                        disposable.dispose()
                        resolve(editor)
                    }
                })

                void vscode.commands.executeCommand(
                    'vscode.diff',
                    originalUri,
                    fileUri,
                    `${fileName}: Original ↔ Amazon Q Changes (Streaming)`,
                    { preserveFocus: true }
                )

                // Timeout after 10 seconds
                setTimeout(() => {
                    disposable.dispose()
                    reject(new Error('Failed to open diff editor within timeout'))
                }, 10000)
            })

            // Initialize Cline-style decorations
            const fadedOverlayController = new DecorationController('fadedOverlay', activeDiffEditor)
            const activeLineController = new DecorationController('activeLine', activeDiffEditor)

            // Apply faded overlay to all lines initially (like Cline)
            fadedOverlayController.addLines(0, activeDiffEditor.document.lineCount)

            // Store the streaming session
            this.activeStreamingSessions.set(toolUseId, {
                filePath,
                originalContent,
                activeDiffEditor,
                fadedOverlayController,
                activeLineController,
                streamedLines: [],
                disposed: false,
            })

            // Show status message
            vscode.window.setStatusBarMessage(`🎬 Streaming changes for ${fileName}...`, 5000)

            getLogger().info(`[StreamingDiffController] ✅ Cline-style diff view opened successfully for ${toolUseId}`)
        } catch (error) {
            getLogger().error(`[StreamingDiffController] ❌ Failed to open diff view for ${toolUseId}: ${error}`)
            throw error
        }
    }

    /**
     * Stream content updates exactly like Cline - update the actual file directly
     */
    async streamContentUpdate(toolUseId: string, partialContent: string, isFinal: boolean = false): Promise<void> {
        const session = this.activeStreamingSessions.get(toolUseId)

        if (!session || session.disposed) {
            getLogger().warn(`[StreamingDiffController] ⚠️ No active streaming session for ${toolUseId}`)
            return
        }

        getLogger().info(
            `[StreamingDiffController] ⚡ Streaming update for ${toolUseId}: ${partialContent.length} chars (final: ${isFinal})`
        )

        try {
            // Split content into lines like Cline
            const accumulatedLines = partialContent.split('\n')
            if (!isFinal) {
                accumulatedLines.pop() // remove the last partial line only if it's not the final update
            }

            const diffEditor = session.activeDiffEditor
            const document = diffEditor.document

            if (!diffEditor || !document) {
                throw new Error('User closed text editor, unable to edit file...')
            }

            // Place cursor at the beginning like Cline
            const beginningOfDocument = new vscode.Position(0, 0)
            diffEditor.selection = new vscode.Selection(beginningOfDocument, beginningOfDocument)

            const currentLine =
                session.streamedLines.length + (accumulatedLines.length - session.streamedLines.length) - 1

            if (currentLine >= 0) {
                // Replace content using WorkspaceEdit like Cline
                const edit = new vscode.WorkspaceEdit()
                const rangeToReplace = new vscode.Range(0, 0, currentLine + 1, 0)
                const contentToReplace = accumulatedLines.slice(0, currentLine + 1).join('\n') + '\n'
                edit.replace(document.uri, rangeToReplace, contentToReplace)
                await vscode.workspace.applyEdit(edit)

                // Update decorations exactly like Cline
                session.activeLineController.setActiveLine(currentLine)
                session.fadedOverlayController.updateOverlayAfterLine(currentLine, document.lineCount)

                // Scroll to show changes like Cline
                this.scrollEditorToLine(diffEditor, currentLine)
            }

            // Update streamed lines
            session.streamedLines = accumulatedLines

            if (isFinal) {
                getLogger().info(`[StreamingDiffController] 🏁 Final update applied for ${toolUseId}`)

                // Handle remaining lines if content is shorter
                if (session.streamedLines.length < document.lineCount) {
                    const edit = new vscode.WorkspaceEdit()
                    edit.delete(document.uri, new vscode.Range(session.streamedLines.length, 0, document.lineCount, 0))
                    await vscode.workspace.applyEdit(edit)
                }

                // Clear decorations like Cline
                session.fadedOverlayController.clear()
                session.activeLineController.clear()

                vscode.window.setStatusBarMessage(`✅ Streaming complete for ${path.basename(session.filePath)}`, 3000)
            }
        } catch (error) {
            getLogger().error(`[StreamingDiffController] ❌ Failed to stream content update for ${toolUseId}: ${error}`)
        }
    }

    /**
     * Ensure the target file exists (create if needed)
     */
    private async ensureFileExists(filePath: string, initialContent: string): Promise<void> {
        try {
            // Check if file exists by trying to open it
            await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
        } catch {
            // File doesn't exist, create it
            const edit = new vscode.WorkspaceEdit()
            edit.createFile(vscode.Uri.file(filePath), { overwrite: false })
            await vscode.workspace.applyEdit(edit)

            // Write initial content
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
            const fullEdit = new vscode.WorkspaceEdit()
            fullEdit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), initialContent)
            await vscode.workspace.applyEdit(fullEdit)

            await document.save()
        }
    }

    /**
     * Scroll editor to line like Cline
     */
    private scrollEditorToLine(editor: vscode.TextEditor, line: number): void {
        const scrollLine = line + 4
        editor.revealRange(new vscode.Range(scrollLine, 0, scrollLine, 0), vscode.TextEditorRevealType.InCenter)
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
            this.activeStreamingSessions.delete(toolUseId)

            getLogger().info(`[StreamingDiffController] ✅ Closed streaming session for ${toolUseId}`)
        } catch (error) {
            getLogger().error(
                `[StreamingDiffController] ❌ Failed to close streaming session for ${toolUseId}: ${error}`
            )
        }
    }

    /**
     * Dispose all resources
     */
    dispose(): void {
        getLogger().info(`[StreamingDiffController] 💥 Disposing streaming diff controller`)

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
        getLogger().info(`[StreamingDiffController] ✅ Disposed all streaming sessions`)
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
