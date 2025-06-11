/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DiffAnimationController - Provides Cline-style streaming animations with GitHub diff visualization
 *
 * Key Optimizations:
 * 1. Region-based animation: Only animates changed lines instead of entire file
 * 2. Smart diff calculation: Uses efficient diff algorithm to find change boundaries
 * 3. Viewport limiting: Caps animation to 100 lines max for performance
 * 4. Context awareness: Includes 3 lines before/after changes for better visibility
 * 5. Dynamic speed: Faster animation for larger changes (20ms vs 30ms per line)
 * 6. Efficient scrolling: Only scrolls when necessary (line not visible)
 *
 * Animation Flow:
 * - Calculate changed region using diffLines
 * - Apply new content immediately
 * - Overlay only the changed region
 * - Animate line-by-line reveal with yellow highlight
 * - Show GitHub-style diff after completion
 */

import * as vscode from 'vscode'
import { getLogger } from 'aws-core-vscode/shared'
import { diffLines } from 'diff'

const diffViewUriScheme = 'amazon-q-diff'

// Decoration controller to manage decoration states
class DecorationController {
    private decorationType: 'fadedOverlay' | 'activeLine' | 'addition' | 'deletion' | 'deletionMarker'
    private editor: vscode.TextEditor
    private ranges: vscode.Range[] = []

    constructor(
        decorationType: 'fadedOverlay' | 'activeLine' | 'addition' | 'deletion' | 'deletionMarker',
        editor: vscode.TextEditor
    ) {
        this.decorationType = decorationType
        this.editor = editor
    }

    getDecoration(): vscode.TextEditorDecorationType {
        switch (this.decorationType) {
            case 'fadedOverlay':
                return fadedOverlayDecorationType
            case 'activeLine':
                return activeLineDecorationType
            case 'addition':
                return githubAdditionDecorationType
            case 'deletion':
                return githubDeletionDecorationType
            case 'deletionMarker':
                return deletionMarkerDecorationType
        }
    }

    addLines(startIndex: number, numLines: number): void {
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

    clear(): void {
        this.ranges = []
        this.editor.setDecorations(this.getDecoration(), this.ranges)
    }

    updateOverlayAfterLine(line: number, totalLines: number): void {
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

    setActiveLine(line: number): void {
        this.ranges = [new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)]
        this.editor.setDecorations(this.getDecoration(), this.ranges)
    }

    setRanges(ranges: vscode.Range[]): void {
        this.ranges = ranges
        this.editor.setDecorations(this.getDecoration(), this.ranges)
    }
}

// Decoration types matching Cline's style
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

// GitHub-style diff decorations
const githubAdditionDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(46, 160, 67, 0.15)',
    isWholeLine: true,
    before: {
        contentText: '+',
        color: 'rgb(46, 160, 67)',
        fontWeight: 'bold',
        width: '20px',
        margin: '0 10px 0 0',
    },
    overviewRulerColor: 'rgba(46, 160, 67, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
})

const githubDeletionDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(248, 81, 73, 0.15)',
    isWholeLine: true,
    textDecoration: 'line-through',
    opacity: '0.7',
    before: {
        contentText: '-',
        color: 'rgb(248, 81, 73)',
        fontWeight: 'bold',
        width: '20px',
        margin: '0 10px 0 0',
    },
    overviewRulerColor: 'rgba(248, 81, 73, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
})

// Decoration for showing deletion markers
const deletionMarkerDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
        contentText: ' ← line(s) removed',
        color: 'rgba(248, 81, 73, 0.7)',
        fontStyle: 'italic',
        margin: '0 0 0 20px',
    },
    overviewRulerColor: 'rgba(248, 81, 73, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
})

// Content provider for the left side of diff view
class DiffContentProvider implements vscode.TextDocumentContentProvider {
    private content = new Map<string, string>()
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
    readonly onDidChange = this._onDidChange.event

    setContent(uri: string, content: string): void {
        this.content.set(uri, content)
        this._onDidChange.fire(vscode.Uri.parse(uri))
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.content.get(uri.toString()) || ''
    }

    dispose(): void {
        this._onDidChange.dispose()
    }
}

export interface DiffAnimation {
    uri: vscode.Uri
    originalContent: string
    newContent: string
    isShowingStaticDiff?: boolean
    animationCancelled?: boolean
    diffViewContent?: string // Store the diff view content
    isFromChatClick?: boolean // Add this to track if opened from chat
}

export interface PartialUpdateOptions {
    changeLocation?: {
        startLine: number
        endLine: number
        startChar?: number
        endChar?: number
    }
    searchContent?: string // The content being searched for
    isPartialUpdate?: boolean // Whether this is a partial update vs full file
}

export class DiffAnimationController {
    private activeAnimations = new Map<string, DiffAnimation>()
    private fadedOverlayControllers = new Map<string, DecorationController>()
    private activeLineControllers = new Map<string, DecorationController>()
    private additionControllers = new Map<string, DecorationController>()
    private deletionControllers = new Map<string, DecorationController>()
    private deletionMarkerControllers = new Map<string, DecorationController>()
    private streamedLines = new Map<string, string[]>()
    private lastFirstVisibleLine = new Map<string, number>()
    private shouldAutoScroll = new Map<string, boolean>()
    private scrollListeners = new Map<string, vscode.Disposable>()
    private animationTimeouts = new Map<string, NodeJS.Timeout[]>()
    private fileSnapshots = new Map<string, string>() // Store file content before animation
    private hiddenEditors = new Map<string, vscode.TextEditor>() // Store hidden editors for undo preservation

    // Track file animation history for intelligent diff display
    private fileAnimationHistory = new Map<
        string,
        {
            lastAnimatedContent: string
            animationCount: number
            isCurrentlyAnimating: boolean
        }
    >()

    // Content provider for diff view
    private contentProvider: DiffContentProvider
    private providerDisposable: vscode.Disposable

    constructor() {
        getLogger().info('[DiffAnimationController] 🚀 Initialized with Cline-style streaming and GitHub diff support')

        // Initialize content provider for diff view
        this.contentProvider = new DiffContentProvider()
        this.providerDisposable = vscode.workspace.registerTextDocumentContentProvider(
            diffViewUriScheme,
            this.contentProvider
        )
    }

    /**
     * Check if we should show static diff for a file
     */
    public shouldShowStaticDiff(filePath: string, newContent: string): boolean {
        const history = this.fileAnimationHistory.get(filePath)
        if (!history) {
            return false // Never animated before
        }

        // If currently animating, don't show static diff
        if (history.isCurrentlyAnimating) {
            return false
        }

        // If content is the same as last animated content, show static diff
        return history.lastAnimatedContent === newContent
    }

    /**
     * Update animation history when starting animation
     */
    private updateAnimationStart(filePath: string): void {
        const history = this.fileAnimationHistory.get(filePath) || {
            lastAnimatedContent: '',
            animationCount: 0,
            isCurrentlyAnimating: false,
        }

        history.isCurrentlyAnimating = true
        history.animationCount++
        this.fileAnimationHistory.set(filePath, history)
    }

    /**
     * Update animation history when completing animation
     */
    private updateAnimationComplete(filePath: string, finalContent: string): void {
        const history = this.fileAnimationHistory.get(filePath)
        if (history) {
            history.isCurrentlyAnimating = false
            history.lastAnimatedContent = finalContent
            this.fileAnimationHistory.set(filePath, history)
        }
    }

    /**
     * Start a diff animation for a file using Cline's streaming approach
     */
    /**
     * Start a diff animation for a file using Cline's streaming approach
     */
    public async startDiffAnimation(
        filePath: string,
        originalContent: string,
        newContent: string,
        isFromChatClick: boolean = false
    ): Promise<void> {
        const isNewFile = originalContent === ''
        getLogger().info(
            `[DiffAnimationController] 🎬 Starting animation for: ${filePath} (new file: ${isNewFile}, from chat: ${isFromChatClick})`
        )

        // Check if we should show static diff instead
        if (isFromChatClick && this.shouldShowStaticDiff(filePath, newContent)) {
            getLogger().info(`[DiffAnimationController] Content unchanged, showing static diff`)
            await this.showStaticDiffView(filePath)
            return
        }

        try {
            // Cancel any existing animation for this file
            this.cancelAnimation(filePath)

            // Mark animation as started
            this.updateAnimationStart(filePath)

            const uri = vscode.Uri.file(filePath)

            // Store animation state
            const animation: DiffAnimation = {
                uri,
                originalContent,
                newContent,
                isShowingStaticDiff: false,
                animationCancelled: false,
                isFromChatClick,
            }
            this.activeAnimations.set(filePath, animation)

            // Ensure the file exists and apply the new content
            let doc: vscode.TextDocument

            try {
                // Try to open existing file
                doc = await vscode.workspace.openTextDocument(uri)
                // Store current content as snapshot
                this.fileSnapshots.set(filePath, doc.getText())
            } catch {
                // File doesn't exist, create it with empty content first
                await vscode.workspace.fs.writeFile(uri, Buffer.from(''))
                doc = await vscode.workspace.openTextDocument(uri)
                this.fileSnapshots.set(filePath, '')
                getLogger().info(`[DiffAnimationController] Created new file: ${filePath}`)
            }

            // Apply the new content using WorkspaceEdit (this preserves undo history)
            // Do this WITHOUT opening a visible editor
            const edit = new vscode.WorkspaceEdit()
            const fullRange = new vscode.Range(
                0,
                0,
                doc.lineCount > 0 ? doc.lineCount - 1 : 0,
                doc.lineCount > 0 ? doc.lineAt(Math.max(0, doc.lineCount - 1)).text.length : 0
            )
            edit.replace(uri, fullRange, newContent)

            // Apply edit with undo support
            const success = await vscode.workspace.applyEdit(edit)
            if (!success) {
                throw new Error('Failed to apply edit to file')
            }

            // Save the document to ensure changes are persisted
            await doc.save()

            // Now open the diff view for animation
            const diffEditor = await this.openClineDiffView(filePath, originalContent, isNewFile)
            if (!diffEditor) {
                throw new Error('Failed to open diff view')
            }

            // Initialize controllers
            const fadedOverlayController = new DecorationController('fadedOverlay', diffEditor)
            const activeLineController = new DecorationController('activeLine', diffEditor)

            this.fadedOverlayControllers.set(filePath, fadedOverlayController)
            this.activeLineControllers.set(filePath, activeLineController)

            // Initialize state
            this.streamedLines.set(filePath, [])
            this.shouldAutoScroll.set(filePath, true)
            this.lastFirstVisibleLine.set(filePath, 0)

            // Add scroll detection
            const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
                if (e.textEditor === diffEditor) {
                    const currentFirstVisibleLine = e.visibleRanges[0]?.start.line || 0
                    const lastLine = this.lastFirstVisibleLine.get(filePath) || 0

                    // If user scrolled up, disable auto-scroll
                    if (currentFirstVisibleLine < lastLine) {
                        this.shouldAutoScroll.set(filePath, false)
                    }

                    this.lastFirstVisibleLine.set(filePath, currentFirstVisibleLine)
                }
            })
            this.scrollListeners.set(filePath, scrollListener)

            // Calculate changed region for optimization
            const changedRegion = this.calculateChangedRegion(originalContent, newContent)
            getLogger().info(
                `[DiffAnimationController] Changed region: lines ${changedRegion.startLine}-${changedRegion.endLine}`
            )

            // Start streaming animation (Cline style) - visual only
            await this.streamContentClineStyle(filePath, diffEditor, newContent, animation, changedRegion)
        } catch (error) {
            getLogger().error(`[DiffAnimationController] ❌ Failed to start animation: ${error}`)
            // Restore file content on error using WorkspaceEdit
            const snapshot = this.fileSnapshots.get(filePath)
            if (snapshot !== undefined) {
                try {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
                    const edit = new vscode.WorkspaceEdit()
                    const fullRange = new vscode.Range(
                        0,
                        0,
                        doc.lineCount > 0 ? doc.lineCount - 1 : 0,
                        doc.lineCount > 0 ? doc.lineAt(Math.max(0, doc.lineCount - 1)).text.length : 0
                    )
                    edit.replace(doc.uri, fullRange, snapshot)
                    await vscode.workspace.applyEdit(edit)
                } catch (restoreError) {
                    getLogger().error(`[DiffAnimationController] Failed to restore content: ${restoreError}`)
                }
            }
            this.stopDiffAnimation(filePath)
            throw error
        }
    }

    /**
     * Close the diff view and return to normal file view
     */
    private async closeDiffView(filePath: string): Promise<void> {
        try {
            // Find all visible editors
            const editors = vscode.window.visibleTextEditors

            // Find the diff editor (it will have the special URI scheme)
            const diffEditor = editors.find(
                (e) => e.document.uri.scheme === diffViewUriScheme || e.document.uri.fsPath === filePath
            )

            if (diffEditor) {
                // Close the diff view
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor')

                // Open the file normally after diff view is closed
                const uri = vscode.Uri.file(filePath)
                const doc = await vscode.workspace.openTextDocument(uri)
                await vscode.window.showTextDocument(doc, { preview: false })

                getLogger().info(
                    `[DiffAnimationController] Closed diff view and opened normal file view for: ${filePath}`
                )
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationController] Error closing diff view: ${error}`)
        }
    }

    /**
     * Calculate the changed region between original and new content
     */
    private calculateChangedRegion(
        originalContent: string,
        newContent: string
    ): { startLine: number; endLine: number; totalLines: number } {
        // For new files, animate all lines
        if (!originalContent || originalContent === '') {
            const lines = newContent.split('\n')
            return {
                startLine: 0,
                endLine: Math.min(lines.length - 1, 99), // Cap at 100 lines
                totalLines: lines.length,
            }
        }

        const changes = diffLines(originalContent, newContent)
        let minChangedLine = Infinity
        let maxChangedLine = -1
        let currentLine = 0
        const newLines = newContent.split('\n')

        for (const change of changes) {
            const changeLines = change.value.split('\n')
            // Remove empty last element from split
            if (changeLines[changeLines.length - 1] === '') {
                changeLines.pop()
            }

            if (change.added || change.removed) {
                minChangedLine = Math.min(minChangedLine, currentLine)
                maxChangedLine = Math.max(maxChangedLine, currentLine + changeLines.length - 1)
            }

            if (!change.removed) {
                currentLine += changeLines.length
            }
        }

        // If no changes found, animate the whole file
        if (minChangedLine === Infinity) {
            return {
                startLine: 0,
                endLine: Math.min(newLines.length - 1, 99),
                totalLines: newLines.length,
            }
        }

        // Add context lines (3 before and after)
        const contextLines = 3
        const startLine = Math.max(0, minChangedLine - contextLines)
        const endLine = Math.min(newLines.length - 1, maxChangedLine + contextLines)

        // Cap at 100 lines for performance
        const animationLines = endLine - startLine + 1
        if (animationLines > 100) {
            getLogger().info(`[DiffAnimationController] Capping animation from ${animationLines} to 100 lines`)
            return {
                startLine,
                endLine: startLine + 99,
                totalLines: newLines.length,
            }
        }

        return {
            startLine,
            endLine,
            totalLines: newLines.length,
        }
    }

    /**
     * Start partial diff animation for specific changes
     */
    public async startPartialDiffAnimation(
        filePath: string,
        originalContent: string,
        newContent: string,
        options: PartialUpdateOptions = {}
    ): Promise<void> {
        const { changeLocation, searchContent, isPartialUpdate = false } = options

        getLogger().info(`[DiffAnimationController] 🎬 Starting partial animation for: ${filePath}`)

        // If we have a specific change location, we can optimize the animation
        if (changeLocation && isPartialUpdate) {
            // Check if we already have a diff view open
            const existingAnimation = this.activeAnimations.get(filePath)
            const existingEditor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)

            if (existingAnimation && existingEditor) {
                // Update only the changed portion
                await this.updatePartialContent(
                    filePath,
                    existingEditor,
                    existingAnimation,
                    changeLocation,
                    searchContent || '',
                    newContent
                )
                return
            }
        }

        // Fall back to full animation if no optimization possible
        return this.startDiffAnimation(filePath, originalContent, newContent)
    }

    /**
     * Cancel ongoing animation for a file
     */
    private cancelAnimation(filePath: string): void {
        const animation = this.activeAnimations.get(filePath)
        if (animation && !animation.isShowingStaticDiff) {
            animation.animationCancelled = true

            // Clear any pending timeouts
            const timeouts = this.animationTimeouts.get(filePath)
            if (timeouts) {
                for (const timeout of timeouts) {
                    clearTimeout(timeout)
                }
                this.animationTimeouts.delete(filePath)
            }

            // Clear decorations
            this.fadedOverlayControllers.get(filePath)?.clear()
            this.activeLineControllers.get(filePath)?.clear()

            getLogger().info(`[DiffAnimationController] ⚠️ Cancelled ongoing animation for: ${filePath}`)
        }
    }

    /**
     * Open VS Code diff view (Cline style)
     */
    private async openClineDiffView(
        filePath: string,
        originalContent: string,
        isNewFile: boolean
    ): Promise<vscode.TextEditor | undefined> {
        const fileName = filePath.split(/[\\\/]/).pop() || 'file'
        const leftUri = vscode.Uri.parse(`${diffViewUriScheme}:${fileName}`).with({
            query: Buffer.from(originalContent).toString('base64'),
        })

        // Set content for left side
        this.contentProvider.setContent(leftUri.toString(), originalContent)

        // Right side is the actual file
        const rightUri = vscode.Uri.file(filePath)

        // DO NOT clear the right side content - it already has the final content
        // This preserves the undo history
        // await vscode.workspace.fs.writeFile(rightUri, Buffer.from(''))

        const title = `${fileName}: ${isNewFile ? 'New File' : "Original ↔ AI's Changes"} (Streaming...)`

        // Execute diff command
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
            preview: false,
            preserveFocus: false,
        })

        // Wait a bit for the diff view to open
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Find the editor for the right side (the actual file)
        let editor = vscode.window.activeTextEditor
        if (editor && editor.document.uri.fsPath === filePath) {
            return editor
        }

        // Fallback: find editor by URI
        editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)
        if (editor) {
            return editor
        }

        // Another attempt after a short delay
        await new Promise((resolve) => setTimeout(resolve, 100))
        return vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)
    }

    /**
     * Stream content line by line (Cline style) with optimization for changed region
     */
    private async streamContentClineStyle(
        filePath: string,
        editor: vscode.TextEditor,
        newContent: string,
        animation: DiffAnimation,
        changedRegion: { startLine: number; endLine: number; totalLines: number }
    ): Promise<void> {
        const fadedOverlayController = this.fadedOverlayControllers.get(filePath)
        const activeLineController = this.activeLineControllers.get(filePath)

        if (!fadedOverlayController || !activeLineController || animation.animationCancelled) {
            return
        }

        // The file already has the new content, we just animate the visual effect
        const totalLines = editor.document.lineCount

        // Apply initial faded overlay to simulate hidden content
        fadedOverlayController.addLines(0, totalLines)

        // Animate the reveal effect
        for (let i = 0; i <= changedRegion.endLine && i < totalLines && !animation.animationCancelled; i++) {
            // Update decorations to show line-by-line reveal
            activeLineController.setActiveLine(i)
            fadedOverlayController.updateOverlayAfterLine(i, totalLines)

            // Auto-scroll if enabled
            if (this.shouldAutoScroll.get(filePath) !== false && i >= changedRegion.startLine) {
                this.scrollEditorToLine(editor, i)
            }

            // Animation delay (only for changed region)
            if (i >= changedRegion.startLine && i <= changedRegion.endLine) {
                const delay = changedRegion.endLine - changedRegion.startLine > 50 ? 20 : 30
                await new Promise((resolve) => setTimeout(resolve, delay))
            }
        }

        // Clear decorations when done
        fadedOverlayController.clear()
        activeLineController.clear()

        // Apply GitHub-style diff decorations
        await this.applyGitHubDiffDecorations(filePath, editor, animation.originalContent, animation.newContent)

        animation.animationCancelled = false

        // Update animation history
        this.updateAnimationComplete(filePath, animation.newContent)

        getLogger().info(`[DiffAnimationController] ✅ Animation completed for: ${filePath}`)

        // Auto-close diff view after animation completes (unless opened from chat)
        if (!animation.isFromChatClick) {
            getLogger().info(`[DiffAnimationController] Auto-closing diff view for: ${filePath}`)
            await this.closeDiffView(filePath)
        }
    }

    /**
     * Update only a portion of the file
     */
    private async updatePartialContent(
        filePath: string,
        editor: vscode.TextEditor,
        animation: DiffAnimation,
        changeLocation: { startLine: number; endLine: number },
        searchContent: string,
        newContent: string
    ): Promise<void> {
        const fadedOverlayController = this.fadedOverlayControllers.get(filePath)
        const activeLineController = this.activeLineControllers.get(filePath)

        if (!fadedOverlayController || !activeLineController) {
            return
        }

        getLogger().info(
            `[DiffAnimationController] 📝 Partial update at lines ${changeLocation.startLine}-${changeLocation.endLine}`
        )

        // Find the exact location in the current document
        const document = editor.document
        let matchStartLine = -1

        if (searchContent) {
            // Search for the exact content in the document
            const documentText = document.getText()
            const searchIndex = documentText.indexOf(searchContent)

            if (searchIndex !== -1) {
                // Convert character index to line number
                const textBefore = documentText.substring(0, searchIndex)
                matchStartLine = (textBefore.match(/\n/g) || []).length
            }
        } else {
            // Use the provided line number directly
            matchStartLine = changeLocation.startLine
        }

        if (matchStartLine === -1) {
            getLogger().warn(`[DiffAnimationController] Could not find search content, falling back to full scan`)
            return this.startDiffAnimation(filePath, animation.originalContent, newContent)
        }

        // Calculate the replacement
        const searchLines = searchContent.split('\n')
        const replacementLines = this.extractReplacementContent(animation.originalContent, newContent, searchContent)

        // Apply the edit using WorkspaceEdit for undo support
        const edit = new vscode.WorkspaceEdit()
        const startPos = new vscode.Position(matchStartLine, 0)
        const endPos = new vscode.Position(matchStartLine + searchLines.length, 0)
        const range = new vscode.Range(startPos, endPos)

        edit.replace(editor.document.uri, range, replacementLines.join('\n') + '\n')
        await vscode.workspace.applyEdit(edit)

        // Animate only the changed lines
        await this.animatePartialChange(
            editor,
            fadedOverlayController,
            activeLineController,
            matchStartLine,
            replacementLines.length
        )

        // Scroll to the change
        if (this.shouldAutoScroll.get(filePath) !== false) {
            this.scrollEditorToLine(editor, matchStartLine)
        }

        // Update animation state
        animation.newContent = document.getText()
    }

    /**
     * Extract replacement content
     */
    private extractReplacementContent(originalContent: string, newContent: string, searchContent: string): string[] {
        // This would use the SEARCH/REPLACE logic to extract just the replacement portion
        const newLines = newContent.split('\n')
        const searchLines = searchContent.split('\n')

        // Find where the change starts in the new content
        let startIndex = 0
        for (let i = 0; i < newLines.length; i++) {
            if (newLines.slice(i, i + searchLines.length).join('\n') !== searchContent) {
                startIndex = i
                break
            }
        }

        // Extract the replacement lines
        return newLines.slice(startIndex, startIndex + searchLines.length)
    }

    /**
     * Animate only the changed portion
     */
    private async animatePartialChange(
        editor: vscode.TextEditor,
        fadedOverlayController: DecorationController,
        activeLineController: DecorationController,
        startLine: number,
        lineCount: number
    ): Promise<void> {
        // Clear previous decorations
        fadedOverlayController.clear()
        activeLineController.clear()

        // Apply overlay only to the changed region
        fadedOverlayController.addLines(startLine, lineCount)

        // Animate the changed lines
        for (let i = 0; i < lineCount; i++) {
            const currentLine = startLine + i

            // Highlight current line
            activeLineController.setActiveLine(currentLine)

            // Update overlay
            if (i < lineCount - 1) {
                fadedOverlayController.clear()
                fadedOverlayController.addLines(currentLine + 1, lineCount - i - 1)
            }

            // Animation delay
            await new Promise((resolve) => setTimeout(resolve, 30))
        }

        // Clear decorations
        fadedOverlayController.clear()
        activeLineController.clear()

        // Apply GitHub diff decorations to the changed region
        await this.applyPartialGitHubDiffDecorations(editor, startLine, lineCount)
    }

    /**
     * Apply diff decorations only to changed region
     */
    private async applyPartialGitHubDiffDecorations(
        editor: vscode.TextEditor,
        startLine: number,
        lineCount: number
    ): Promise<void> {
        const additions: vscode.Range[] = []

        // Mark all changed lines as additions
        for (let i = 0; i < lineCount && startLine + i < editor.document.lineCount; i++) {
            additions.push(new vscode.Range(startLine + i, 0, startLine + i, Number.MAX_SAFE_INTEGER))
        }

        // Get or create addition controller
        let additionController = this.additionControllers.get(editor.document.uri.fsPath)
        if (!additionController) {
            additionController = new DecorationController('addition', editor)
            this.additionControllers.set(editor.document.uri.fsPath, additionController)
        }

        // Apply decorations
        additionController.setRanges(additions)

        getLogger().info(`[DiffAnimationController] Applied partial diff decorations: ${additions.length} additions`)
    }

    /**
     * Show static GitHub-style diff view for a file
     */
    public async showStaticDiffView(filePath: string): Promise<void> {
        const animation = this.activeAnimations.get(filePath)
        if (!animation) {
            getLogger().warn(`[DiffAnimationController] No animation data found for: ${filePath}`)
            return
        }

        // Open diff view again (static, no animation)
        const fileName = filePath.split(/[\\\/]/).pop() || 'file'
        const leftUri = vscode.Uri.parse(`${diffViewUriScheme}:${fileName}`).with({
            query: Buffer.from(animation.originalContent).toString('base64'),
        })

        // Set content for left side
        this.contentProvider.setContent(leftUri.toString(), animation.originalContent)

        // Right side is the actual file with final content
        const rightUri = vscode.Uri.file(filePath)

        // Ensure file has the final content
        const doc = await vscode.workspace.openTextDocument(rightUri)
        if (doc.getText() !== animation.newContent) {
            const edit = new vscode.WorkspaceEdit()
            const fullRange = new vscode.Range(
                0,
                0,
                doc.lineCount > 0 ? doc.lineCount - 1 : 0,
                doc.lineCount > 0 ? doc.lineAt(Math.max(0, doc.lineCount - 1)).text.length : 0
            )
            edit.replace(rightUri, fullRange, animation.newContent)
            await vscode.workspace.applyEdit(edit)
        }

        const title = `${fileName}: Original ↔ AI's Changes`

        // Execute diff command
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
            preview: false,
            preserveFocus: false,
        })

        // Wait for diff view to open
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Find the editor
        const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)
        if (!editor) {
            getLogger().warn(`[DiffAnimationController] No editor found for static diff view`)
            return
        }

        // Apply GitHub-style diff decorations immediately (no animation)
        await this.applyGitHubDiffDecorations(filePath, editor, animation.originalContent, animation.newContent)

        animation.isShowingStaticDiff = true

        getLogger().info(`[DiffAnimationController] Showing static diff view for: ${filePath}`)
    }

    /**
     * Exit diff view and restore final content
     */
    public async exitDiffView(filePath: string): Promise<void> {
        const animation = this.activeAnimations.get(filePath)
        if (!animation || !animation.isShowingStaticDiff) {
            return
        }

        const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)
        if (!editor) {
            return
        }

        // Clear all decorations
        this.additionControllers.get(filePath)?.clear()
        this.deletionControllers.get(filePath)?.clear()

        // Restore the final content (without deleted lines)
        const edit = new vscode.WorkspaceEdit()
        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
        )
        edit.replace(editor.document.uri, fullRange, animation.newContent)
        await vscode.workspace.applyEdit(edit)

        animation.isShowingStaticDiff = false
        animation.diffViewContent = undefined

        getLogger().info(`[DiffAnimationController] Exited diff view for: ${filePath}`)
    }

    /**
     * Apply GitHub-style diff decorations with actual deletion lines
     */
    private async applyGitHubDiffDecorations(
        filePath: string,
        editor: vscode.TextEditor,
        originalContent: string,
        newContent: string
    ): Promise<void> {
        let additionController = this.additionControllers.get(filePath)
        let deletionController = this.deletionControllers.get(filePath)

        if (!additionController) {
            additionController = new DecorationController('addition', editor)
            this.additionControllers.set(filePath, additionController)
        }

        if (!deletionController) {
            deletionController = new DecorationController('deletion', editor)
            this.deletionControllers.set(filePath, deletionController)
        }

        // Calculate diff
        const changes = diffLines(originalContent, newContent)
        const additions: vscode.Range[] = []
        const deletions: vscode.Range[] = []

        let currentLine = 0

        for (const change of changes) {
            const lines = change.value.split('\n').filter((line) => line !== '')

            if (change.added) {
                // Added lines
                for (let i = 0; i < lines.length && currentLine + i < editor.document.lineCount; i++) {
                    additions.push(new vscode.Range(currentLine + i, 0, currentLine + i, Number.MAX_SAFE_INTEGER))
                }
                currentLine += lines.length
            } else if (change.removed) {
                // Skip removed lines (they're shown in the left panel)
            } else {
                // Unchanged lines
                currentLine += lines.length
            }
        }

        // Apply decorations
        additionController.setRanges(additions)
        deletionController.setRanges(deletions)

        getLogger().info(
            `[DiffAnimationController] Applied GitHub diff: ${additions.length} additions, ${deletions.length} deletions`
        )

        // Store that we're showing diff view
        const animation = this.activeAnimations.get(filePath)
        if (animation) {
            animation.isShowingStaticDiff = true
        }
    }

    /**
     * Scroll editor to line
     */
    private scrollEditorToLine(editor: vscode.TextEditor, line: number): void {
        const scrollLine = Math.max(0, line - 5)
        editor.revealRange(
            new vscode.Range(scrollLine, 0, scrollLine, 0),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        )
    }

    /**
     * Support for incremental diff animation
     */
    public async startIncrementalDiffAnimation(
        filePath: string,
        previousContent: string,
        currentContent: string,
        isFirstUpdate: boolean = false
    ): Promise<void> {
        getLogger().info(`[DiffAnimationController] 🎬 Starting incremental animation for: ${filePath}`)

        if (isFirstUpdate || previousContent === '') {
            return this.startDiffAnimation(filePath, previousContent, currentContent)
        }

        // Cancel any ongoing animation
        this.cancelAnimation(filePath)

        // For incremental updates, apply changes immediately with flash effect
        try {
            const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)
            if (!editor) {
                return this.startDiffAnimation(filePath, previousContent, currentContent)
            }

            const fadedOverlayController = this.fadedOverlayControllers.get(filePath)
            const activeLineController = this.activeLineControllers.get(filePath)

            if (!fadedOverlayController || !activeLineController) {
                return this.startDiffAnimation(filePath, previousContent, currentContent)
            }

            // Apply content change using WorkspaceEdit
            const edit = new vscode.WorkspaceEdit()
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            )
            edit.replace(editor.document.uri, fullRange, currentContent)
            await vscode.workspace.applyEdit(edit)

            // Flash effect for changed lines
            const newLines = currentContent.split('\n')
            const prevLines = previousContent.split('\n')
            const changedLines: number[] = []

            for (let i = 0; i < Math.max(newLines.length, prevLines.length); i++) {
                if (newLines[i] !== prevLines[i]) {
                    changedLines.push(i)
                }
            }

            // Apply flash effect
            for (const line of changedLines) {
                if (line < editor.document.lineCount) {
                    activeLineController.setActiveLine(line)
                    await new Promise((resolve) => setTimeout(resolve, 200))
                }
            }

            // Clear decorations
            activeLineController.clear()
            fadedOverlayController.clear()

            // Update animation data for the incremental change
            const animation = this.activeAnimations.get(filePath)
            if (animation) {
                animation.originalContent = previousContent
                animation.newContent = currentContent

                // Show GitHub-style diff
                await this.applyGitHubDiffDecorations(filePath, editor, previousContent, currentContent)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationController] ❌ Incremental animation failed: ${error}`)
            return this.startDiffAnimation(filePath, previousContent, currentContent)
        }
    }

    /**
     * Stop diff animation for a file
     */
    public stopDiffAnimation(filePath: string): void {
        getLogger().info(`[DiffAnimationController] 🛑 Stopping animation for: ${filePath}`)

        // If showing diff view, exit it first
        const animation = this.activeAnimations.get(filePath)
        if (animation?.isShowingStaticDiff) {
            // Restore final content before clearing using WorkspaceEdit
            const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)
            if (editor && animation.newContent) {
                const edit = new vscode.WorkspaceEdit()
                const fullRange = new vscode.Range(
                    editor.document.positionAt(0),
                    editor.document.positionAt(editor.document.getText().length)
                )
                edit.replace(editor.document.uri, fullRange, animation.newContent)
                void vscode.workspace.applyEdit(edit).then(() => {
                    getLogger().info(`[DiffAnimationController] Restored final content for: ${filePath}`)
                })
            }
        }

        // Cancel animation if running
        this.cancelAnimation(filePath)

        // Clear all state for this file
        this.activeAnimations.delete(filePath)
        this.fileSnapshots.delete(filePath)
        this.hiddenEditors.delete(filePath)

        const fadedOverlayController = this.fadedOverlayControllers.get(filePath)
        if (fadedOverlayController) {
            fadedOverlayController.clear()
            this.fadedOverlayControllers.delete(filePath)
        }

        const activeLineController = this.activeLineControllers.get(filePath)
        if (activeLineController) {
            activeLineController.clear()
            this.activeLineControllers.delete(filePath)
        }

        const additionController = this.additionControllers.get(filePath)
        if (additionController) {
            additionController.clear()
            this.additionControllers.delete(filePath)
        }

        const deletionController = this.deletionControllers.get(filePath)
        if (deletionController) {
            deletionController.clear()
            this.deletionControllers.delete(filePath)
        }

        const deletionMarkerController = this.deletionMarkerControllers.get(filePath)
        if (deletionMarkerController) {
            deletionMarkerController.clear()
            this.deletionMarkerControllers.delete(filePath)
        }

        this.streamedLines.delete(filePath)
        this.shouldAutoScroll.delete(filePath)
        this.lastFirstVisibleLine.delete(filePath)

        const scrollListener = this.scrollListeners.get(filePath)
        if (scrollListener) {
            scrollListener.dispose()
            this.scrollListeners.delete(filePath)
        }
    }

    /**
     * Stop all active diff animations
     */
    public stopAllAnimations(): void {
        getLogger().info('[DiffAnimationController] 🛑 Stopping all animations')
        for (const [filePath] of this.activeAnimations) {
            this.stopDiffAnimation(filePath)
        }
    }

    /**
     * Check if an animation is currently active for a file
     */
    public isAnimating(filePath: string): boolean {
        const animation = this.activeAnimations.get(filePath)
        const history = this.fileAnimationHistory.get(filePath)
        return (
            (animation ? !animation.isShowingStaticDiff && !animation.animationCancelled : false) ||
            (history ? history.isCurrentlyAnimating : false)
        )
    }

    /**
     * Check if showing static diff for a file
     */
    public isShowingStaticDiff(filePath: string): boolean {
        const animation = this.activeAnimations.get(filePath)
        return animation?.isShowingStaticDiff ?? false
    }

    /**
     * Get animation statistics
     */
    public getAnimationStats(): { activeCount: number; filePaths: string[] } {
        return {
            activeCount: this.activeAnimations.size,
            filePaths: Array.from(this.activeAnimations.keys()),
        }
    }

    public dispose(): void {
        getLogger().info('[DiffAnimationController] 💥 Disposing controller')
        this.stopAllAnimations()

        // Dispose content provider
        this.providerDisposable.dispose()
        this.contentProvider.dispose()

        // Dispose decoration types
        fadedOverlayDecorationType.dispose()
        activeLineDecorationType.dispose()
        githubAdditionDecorationType.dispose()
        githubDeletionDecorationType.dispose()
        deletionMarkerDecorationType.dispose()
    }
}
