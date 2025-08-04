/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from 'aws-core-vscode/shared'
import { FsWriteParams } from './types'

export const diffViewUriScheme = 'amazonq-diff'

/**
 * Streaming Diff Controller using temporary files for animations
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
            fsWriteParams?: FsWriteParams
        }
    >()

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
        this.contentProvider = new DiffContentProvider()
        vscode.workspace.registerTextDocumentContentProvider(diffViewUriScheme, this.contentProvider)
    }

    updateFsWriteParams(toolUseId: string, fsWriteParams: FsWriteParams): void {
        const session = this.activeStreamingSessions.get(toolUseId)
        if (session) {
            session.fsWriteParams = fsWriteParams

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
                } else {
                    const fsReplaceSession = this.fsReplaceSessionsByFile.get(filePath)!
                    fsReplaceSession.toolUseIds.add(toolUseId)
                    fsReplaceSession.lastActivity = Date.now()
                }
            }
        }
    }
    async openStreamingDiffView(toolUseId: string, filePath: string, originalContent: string): Promise<void> {
        try {
            const fileName = path.basename(filePath)

            let tempFilePath: string
            let shouldCreateNewTempFile = true

            // Check if there's already an fsReplace session for this file
            const existingFsReplaceSession = this.fsReplaceSessionsByFile.get(filePath)
            if (existingFsReplaceSession) {
                tempFilePath = existingFsReplaceSession.tempFilePath
                shouldCreateNewTempFile = false

                // Add this toolUseId to the existing session
                existingFsReplaceSession.toolUseIds.add(toolUseId)
                existingFsReplaceSession.lastActivity = Date.now()
            } else {
                // Create new temp file path
                tempFilePath = path.join(path.dirname(filePath), `.amazonq-temp-${toolUseId}-${fileName}`)
            }

            const tempFileUri = vscode.Uri.file(tempFilePath)

            const originalUri = vscode.Uri.parse(`${diffViewUriScheme}:${fileName}`).with({
                query: Buffer.from(originalContent).toString('base64'),
            })
            if (shouldCreateNewTempFile) {
                await this.createTempFile(tempFilePath, originalContent)
            }
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
                    `${fileName}: Original ↔ Amazon Q Changes (Animation Preview)`,
                    {
                        preserveFocus: true,
                        preview: false,
                    }
                )

                setTimeout(() => {
                    disposable.dispose()
                    reject(new Error('Failed to open diff editor within timeout'))
                }, 10000)
            })

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
        } catch (error) {
            getLogger().error(`Failed to open diff view for ${toolUseId}: ${error}`)
            throw error
        }
    }

    /**
     * Stream content updates to temporary file for animation - handles different fsWrite and fsReplace operation types
     */
    async streamContentUpdate(toolUseId: string, partialContent: string, isFinal: boolean = false): Promise<void> {
        const session = this.activeStreamingSessions.get(toolUseId)

        if (!session || session.disposed) {
            return
        }

        try {
            const command = session.fsWriteParams?.command

            if (command === 'fsReplace_diffPair') {
                await this.handleFsReplaceDiffPair(session, partialContent, isFinal)
                return
            } else if (command === 'fsReplace_completion') {
                await this.handleFsReplaceCompletionSignal(session)
                return
            }

            let contentToAnimate = partialContent

            if (session.fsWriteParams?.command === 'append') {
                try {
                    const needsNewline = session.originalContent.length !== 0 && !session.originalContent.endsWith('\n')
                    contentToAnimate = session.originalContent + (needsNewline ? '\n' : '') + partialContent
                } catch (error) {
                    contentToAnimate = partialContent
                }
            } else if (session.fsWriteParams?.command === 'create') {
                contentToAnimate = partialContent
            }
            const accumulatedLines = contentToAnimate.split('\n')
            if (!isFinal) {
                accumulatedLines.pop()
            }

            const diffEditor = session.activeDiffEditor
            const document = diffEditor.document

            if (!diffEditor || !document) {
                throw new Error('User closed text editor, unable to edit file...')
            }

            const beginningOfDocument = new vscode.Position(0, 0)
            diffEditor.selection = new vscode.Selection(beginningOfDocument, beginningOfDocument)
            const newLines = accumulatedLines.slice(session.streamedLines.length)

            for (let i = 0; i < newLines.length; i++) {
                const lineIndex = session.streamedLines.length + i
                const lineContent = newLines[i]
                const edit = new vscode.WorkspaceEdit()

                if (lineIndex < document.lineCount) {
                    const lineRange = new vscode.Range(lineIndex, 0, lineIndex, document.lineAt(lineIndex).text.length)
                    edit.replace(document.uri, lineRange, lineContent)
                } else {
                    const insertPosition = new vscode.Position(document.lineCount, 0)
                    const contentToInsert = (lineIndex > 0 ? '\n' : '') + lineContent
                    edit.insert(document.uri, insertPosition, contentToInsert)
                }

                await vscode.workspace.applyEdit(edit)

                session.activeLineController.setActiveLine(lineIndex)
                session.fadedOverlayController.updateOverlayAfterLine(lineIndex, document.lineCount)

                this.scrollEditorToLine(diffEditor, lineIndex)
            }
            session.streamedLines = accumulatedLines

            if (!isFinal) {
                return
            }

            // Final cleanup when streaming is complete
            if (session.streamedLines.length < document.lineCount) {
                const edit = new vscode.WorkspaceEdit()
                edit.delete(document.uri, new vscode.Range(session.streamedLines.length, 0, document.lineCount, 0))
                await vscode.workspace.applyEdit(edit)
            }

            try {
                await document.save()
            } catch (saveError) {
                getLogger().error(`Failed to save temp file ${session.tempFilePath}: ${saveError}`)
            }

            session.fadedOverlayController.clear()
            session.activeLineController.clear()

            setTimeout(async () => {
                try {
                    await this.cleanupTempFile(session.tempFilePath)
                    session.disposed = true
                    this.activeStreamingSessions.delete(toolUseId)
                } catch (error) {
                    getLogger().warn(`Failed to auto-cleanup temp file ${session.tempFilePath}: ${error}`)
                }
            }, 500)
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
        try {
            const diffEditor = session.activeDiffEditor
            const document = diffEditor.document

            if (!diffEditor || !document) {
                throw new Error('User closed text editor, unable to edit file...')
            }
            await new Promise((resolve) => setTimeout(resolve, 10))

            // Extract diff pair parameters from fsWriteParams (removed startLine - calculate dynamically)
            const { oldStr, newStr, pairIndex, totalPairs } = session.fsWriteParams || {}

            if (!oldStr || !newStr) {
                return
            }
            const currentContent = document.getText()

            if (document.uri.fsPath !== session.tempFilePath) {
                try {
                    const correctDocument = await vscode.workspace.openTextDocument(
                        vscode.Uri.file(session.tempFilePath)
                    )
                    if (correctDocument) {
                        const correctEditor = vscode.window.visibleTextEditors.find(
                            (editor) => editor.document.uri.fsPath === session.tempFilePath
                        )
                        if (correctEditor) {
                            session.activeDiffEditor = correctEditor
                        }
                    }
                } catch (error) {
                    getLogger().error(`[StreamingDiffController] ❌ Failed to correct document path: ${error}`)
                    return
                }
            }

            // Find the location of oldStr in the current content
            const oldStrIndex = currentContent.indexOf(oldStr)
            if (oldStrIndex === -1) {
                return
            }

            const beforeOldStr = currentContent.substring(0, oldStrIndex)
            const startLineNumber = beforeOldStr.split('\n').length - 1
            const oldStrLines = oldStr.split('\n')
            const endLineNumber = startLineNumber + oldStrLines.length - 1
            this.scrollEditorToLine(diffEditor, startLineNumber)
            for (let lineNum = startLineNumber; lineNum <= endLineNumber; lineNum++) {
                session.activeLineController.setActiveLine(lineNum)
                await new Promise((resolve) => setTimeout(resolve, 50))
            }
            const edit = new vscode.WorkspaceEdit()
            const oldStrStartPos = document.positionAt(oldStrIndex)
            const oldStrEndPos = document.positionAt(oldStrIndex + oldStr.length)
            const replaceRange = new vscode.Range(oldStrStartPos, oldStrEndPos)
            edit.replace(document.uri, replaceRange, newStr)
            await vscode.workspace.applyEdit(edit)
            const newStrLines = newStr.split('\n')
            const newEndLineNumber = startLineNumber + newStrLines.length - 1
            for (let lineNum = startLineNumber; lineNum <= newEndLineNumber; lineNum++) {
                session.activeLineController.setActiveLine(lineNum)
                session.fadedOverlayController.updateOverlayAfterLine(lineNum, document.lineCount)
                await new Promise((resolve) => setTimeout(resolve, 20))
            }
            setTimeout(() => {
                session.activeLineController.clear()
            }, 500)

            try {
                await document.save()
            } catch (saveError) {
                getLogger().error(
                    `[StreamingDiffController] ❌ Failed to save fsReplace diffPair temp file: ${saveError}`
                )
            }
            if (!isFinal) {
                return
            }
            await this.handleFsReplaceCompletion(session, pairIndex || 0, totalPairs || 1)
        } catch (error) {
            getLogger().error(`[StreamingDiffController] ❌ Failed to handle fsReplace diffPair: ${error}`)
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
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(tempFilePath))
            const fullEdit = new vscode.WorkspaceEdit()
            fullEdit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), initialContent)
            await vscode.workspace.applyEdit(fullEdit)

            await document.save()
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

        try {
            session.disposed = true
            session.fadedOverlayController.clear()
            session.activeLineController.clear()

            // Clean up temp file immediately when session is closed
            if (session.tempFilePath) {
                await this.cleanupTempFile(session.tempFilePath)
            }

            this.activeStreamingSessions.delete(toolUseId)
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
                } catch (saveError) {
                    getLogger().error(`[StreamingDiffController] ❌ Failed to save fsReplace temp file: ${saveError}`)
                }
            }
            setTimeout(async () => {
                try {
                    await this.cleanupTempFile(session.tempFilePath)
                    session.disposed = true
                    const sessionsToRemove: string[] = []
                    for (const [toolUseId, sessionData] of this.activeStreamingSessions.entries()) {
                        if (sessionData.filePath === filePath) {
                            sessionsToRemove.push(toolUseId)
                        }
                    }

                    for (const toolUseId of sessionsToRemove) {
                        this.activeStreamingSessions.delete(toolUseId)
                    }

                    this.fsReplaceSessionsByFile.delete(filePath)
                } catch (error) {
                    getLogger().warn(
                        `[StreamingDiffController] ⚠️ Failed to cleanup fsReplace session for ${filePath}: ${error}`
                    )
                }
            }, 500)
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
            return
        }

        fsReplaceSession.completedPairs++
        fsReplaceSession.lastActivity = Date.now()
        const allPairsComplete = fsReplaceSession.completedPairs >= fsReplaceSession.totalExpectedPairs
        const isLastPairInSequence = pairIndex === totalPairs - 1
        if (allPairsComplete && isLastPairInSequence) {
            session.fadedOverlayController.clear()
            session.activeLineController.clear()
            setTimeout(async () => {
                try {
                    await this.cleanupTempFile(fsReplaceSession.tempFilePath)
                    for (const toolUseId of fsReplaceSession.toolUseIds) {
                        const sessionToCleanup = this.activeStreamingSessions.get(toolUseId)
                        if (sessionToCleanup) {
                            sessionToCleanup.disposed = true
                            this.activeStreamingSessions.delete(toolUseId)
                        }
                    }
                    this.fsReplaceSessionsByFile.delete(filePath)
                } catch (error) {
                    getLogger().warn(
                        `[StreamingDiffController] ⚠️ Failed to cleanup fsReplace session for ${filePath}: ${error}`
                    )
                }
            }, 1000) // 1 second delay to ensure all operations complete
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
        for (const [, fsReplaceSession] of this.fsReplaceSessionsByFile.entries()) {
            if (fsReplaceSession.tempFilePath) {
                tempFilesToCleanup.push(fsReplaceSession.tempFilePath)
            }
        }
        for (const tempFilePath of tempFilesToCleanup) {
            try {
                await this.cleanupTempFile(tempFilePath)
            } catch (error) {
                getLogger().warn(`[StreamingDiffController] ⚠️ Failed to cleanup temp file ${tempFilePath}: ${error}`)
            }
        }
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

class DiffContentProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
        try {
            return Buffer.from(uri.query, 'base64').toString('utf8')
        } catch {
            return ''
        }
    }
}

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
        this.ranges = this.ranges.filter((range) => range.end.line < line)
        if (line < totalLines - 1) {
            this.ranges.push(
                new vscode.Range(
                    new vscode.Position(line + 1, 0),
                    new vscode.Position(totalLines - 1, Number.MAX_SAFE_INTEGER)
                )
            )
        }
        this.editor.setDecorations(this.getDecoration(), this.ranges)
    }

    setActiveLine(line: number) {
        this.ranges = [new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)]
        this.editor.setDecorations(this.getDecoration(), this.ranges)
    }
}
