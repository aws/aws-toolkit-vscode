/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from 'aws-core-vscode/shared'
import { diffLines } from 'diff'

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

    getDecoration() {
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

    setRanges(ranges: vscode.Range[]) {
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

export interface DiffAnimation {
    uri: vscode.Uri
    originalContent: string
    newContent: string
    isShowingStaticDiff?: boolean
    animationCancelled?: boolean
    diffViewContent?: string // Store the diff view content
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

    constructor() {
        getLogger().info('[DiffAnimationController] 🚀 Initialized with Cline-style streaming and GitHub diff support')
    }

    /**
     * Start a diff animation for a file using Cline's streaming approach
     */
    public async startDiffAnimation(filePath: string, originalContent: string, newContent: string): Promise<void> {
        getLogger().info(`[DiffAnimationController] 🎬 Starting Cline-style animation for: ${filePath}`)

        try {
            // Cancel any existing animation for this file
            this.cancelAnimation(filePath)

            const uri = vscode.Uri.file(filePath)

            // Store animation state
            const animation: DiffAnimation = {
                uri,
                originalContent,
                newContent,
                isShowingStaticDiff: false,
                animationCancelled: false,
            }
            this.activeAnimations.set(filePath, animation)

            // Open or find the document
            let document: vscode.TextDocument
            let editor: vscode.TextEditor

            try {
                const openEditor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)
                if (openEditor) {
                    editor = openEditor
                    document = openEditor.document
                } else {
                    document = await vscode.workspace.openTextDocument(uri)
                    editor = await vscode.window.showTextDocument(document, {
                        preview: false,
                        preserveFocus: false,
                        viewColumn: vscode.ViewColumn.Active,
                    })
                }
            } catch (error) {
                // Create new file if it doesn't exist
                await vscode.workspace.fs.writeFile(uri, Buffer.from(''))
                document = await vscode.workspace.openTextDocument(uri)
                editor = await vscode.window.showTextDocument(document, {
                    preview: false,
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.Active,
                })
            }

            // Initialize controllers
            const fadedOverlayController = new DecorationController('fadedOverlay', editor)
            const activeLineController = new DecorationController('activeLine', editor)
            const additionController = new DecorationController('addition', editor)
            const deletionController = new DecorationController('deletion', editor)
            const deletionMarkerController = new DecorationController('deletionMarker', editor)

            this.fadedOverlayControllers.set(filePath, fadedOverlayController)
            this.activeLineControllers.set(filePath, activeLineController)
            this.additionControllers.set(filePath, additionController)
            this.deletionControllers.set(filePath, deletionController)
            this.deletionMarkerControllers.set(filePath, deletionMarkerController)

            // Initialize state
            this.streamedLines.set(filePath, [])
            this.shouldAutoScroll.set(filePath, true)
            this.lastFirstVisibleLine.set(filePath, 0)

            // For new files, set content to empty instead of original
            const isNewFile = originalContent === ''
            const startContent = isNewFile ? '' : originalContent

            // Apply initial content
            const edit = new vscode.WorkspaceEdit()
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
            edit.replace(uri, fullRange, startContent)
            await vscode.workspace.applyEdit(edit)

            // Wait for document to update
            await new Promise((resolve) => setTimeout(resolve, 100))

            // Apply faded overlay to all lines initially (for new files, this will be minimal)
            if (!isNewFile && editor.document.lineCount > 0) {
                fadedOverlayController.addLines(0, editor.document.lineCount)
            }

            // Add scroll detection
            const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
                if (e.textEditor === editor) {
                    const currentFirstVisibleLine = e.visibleRanges[0]?.start.line || 0
                    this.lastFirstVisibleLine.set(filePath, currentFirstVisibleLine)
                }
            })
            this.scrollListeners.set(filePath, scrollListener)

            // Start streaming animation
            await this.streamContent(filePath, editor, newContent)
        } catch (error) {
            getLogger().error(`[DiffAnimationController] ❌ Failed to start animation: ${error}`)
            throw error
        }
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
     * Show static GitHub-style diff view for a file
     */
    public async showStaticDiffView(filePath: string): Promise<void> {
        const animation = this.activeAnimations.get(filePath)
        if (!animation) {
            getLogger().warn(`[DiffAnimationController] No animation data found for: ${filePath}`)
            return
        }

        const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)
        if (!editor) {
            getLogger().warn(`[DiffAnimationController] No editor found for: ${filePath}`)
            return
        }

        // If already showing diff, toggle back to normal view
        if (animation.isShowingStaticDiff && animation.diffViewContent) {
            await this.exitDiffView(filePath)
            return
        }

        // Clear streaming decorations
        this.fadedOverlayControllers.get(filePath)?.clear()
        this.activeLineControllers.get(filePath)?.clear()

        // Apply GitHub-style diff decorations
        await this.applyGitHubDiffDecorations(filePath, editor, animation.originalContent, animation.newContent)

        animation.isShowingStaticDiff = true
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
     *
     * This method creates a unified diff view by:
     * 1. Building content that includes BOTH added and removed lines
     * 2. Applying green highlighting to added lines
     * 3. Applying red highlighting with strikethrough to removed lines
     * 4. The removed lines are temporarily inserted into the document for visualization
     *
     * Note: The diff view is temporary - users should not edit while in diff view.
     * Call exitDiffView() or click the file tab again to restore the final content.
     */
    private async applyGitHubDiffDecorations(
        filePath: string,
        editor: vscode.TextEditor,
        originalContent: string,
        newContent: string
    ): Promise<void> {
        const additionController = this.additionControllers.get(filePath)
        const deletionController = this.deletionControllers.get(filePath)

        if (!additionController || !deletionController) {
            return
        }

        // Calculate diff
        const changes = diffLines(originalContent, newContent)
        const additions: vscode.Range[] = []
        const deletions: vscode.Range[] = []

        // Build the diff view content with removed lines included
        let diffViewContent = ''
        let currentLineInDiffView = 0

        for (const change of changes) {
            const lines = change.value.split('\n').filter((line) => line !== '')

            if (change.added) {
                // Added lines - these exist in the new content
                for (const line of lines) {
                    diffViewContent += line + '\n'
                    additions.push(new vscode.Range(currentLineInDiffView, 0, currentLineInDiffView, line.length))
                    currentLineInDiffView++
                }
            } else if (change.removed) {
                // Removed lines - we'll insert these into the view
                for (const line of lines) {
                    diffViewContent += line + '\n'
                    deletions.push(new vscode.Range(currentLineInDiffView, 0, currentLineInDiffView, line.length))
                    currentLineInDiffView++
                }
            } else {
                // Unchanged lines
                for (const line of lines) {
                    diffViewContent += line + '\n'
                    currentLineInDiffView++
                }
            }
        }

        // Apply the diff view content
        const edit = new vscode.WorkspaceEdit()
        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
        )
        edit.replace(editor.document.uri, fullRange, diffViewContent.trimEnd())
        await vscode.workspace.applyEdit(edit)

        // Wait for document to update
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Apply decorations
        additionController.setRanges(additions)
        deletionController.setRanges(deletions)

        getLogger().info(
            `[DiffAnimationController] Applied GitHub diff: ${additions.length} additions, ${deletions.length} deletions shown`
        )

        // Store that we're showing diff view
        const animation = this.activeAnimations.get(filePath)
        if (animation) {
            animation.isShowingStaticDiff = true
            animation.diffViewContent = diffViewContent.trimEnd()
        }
    }

    /**
     * Stream content in Cline style
     */
    private async streamContent(filePath: string, editor: vscode.TextEditor, newContent: string): Promise<void> {
        const animation = this.activeAnimations.get(filePath)
        if (!animation) {
            return
        }

        const lines = newContent.split('\n')
        const streamedLines: string[] = []
        const fadedOverlayController = this.fadedOverlayControllers.get(filePath)
        const activeLineController = this.activeLineControllers.get(filePath)
        const timeouts: NodeJS.Timeout[] = []

        if (!fadedOverlayController || !activeLineController) {
            return
        }

        this.animationTimeouts.set(filePath, timeouts)

        // For new files, apply the entire content immediately then animate
        const isNewFile = animation.originalContent === ''
        if (isNewFile) {
            const edit = new vscode.WorkspaceEdit()
            edit.replace(editor.document.uri, new vscode.Range(0, 0, 0, 0), newContent)
            await vscode.workspace.applyEdit(edit)
            await new Promise((resolve) => setTimeout(resolve, 100))

            // Apply faded overlay to all lines
            fadedOverlayController.addLines(0, editor.document.lineCount)
        }

        // Simulate streaming by updating decorations progressively
        for (let i = 0; i < lines.length; i++) {
            if (animation.animationCancelled) {
                getLogger().info(`[DiffAnimationController] Animation cancelled for: ${filePath}`)
                return
            }

            streamedLines.push(lines[i])
            this.streamedLines.set(filePath, [...streamedLines])

            const timeout = setTimeout(async () => {
                if (animation.animationCancelled) {
                    return
                }

                // Update decorations for streaming effect
                await this.updateStreamingDecorations(filePath, editor, i, lines.length)
            }, i * 50) // 50ms delay between lines

            timeouts.push(timeout)
        }

        // Final cleanup after all lines are processed
        const finalTimeout = setTimeout(
            async () => {
                if (!animation.animationCancelled) {
                    await this.finalizeAnimation(filePath, editor)
                }
            },
            lines.length * 50 + 100
        )

        timeouts.push(finalTimeout)
    }

    /**
     * Update decorations during streaming
     */
    private async updateStreamingDecorations(
        filePath: string,
        editor: vscode.TextEditor,
        currentLineIndex: number,
        totalLines: number
    ): Promise<void> {
        const fadedOverlayController = this.fadedOverlayControllers.get(filePath)
        const activeLineController = this.activeLineControllers.get(filePath)
        const shouldAutoScroll = this.shouldAutoScroll.get(filePath) ?? true

        if (!fadedOverlayController || !activeLineController) {
            return
        }

        // Update decorations
        activeLineController.setActiveLine(currentLineIndex)
        fadedOverlayController.updateOverlayAfterLine(currentLineIndex, editor.document.lineCount)

        // Handle scrolling
        if (shouldAutoScroll) {
            if (currentLineIndex % 5 === 0 || currentLineIndex === totalLines - 1) {
                this.scrollEditorToLine(editor, currentLineIndex)
            }
        }
    }

    /**
     * Finalize animation and show diff
     */
    private async finalizeAnimation(filePath: string, editor: vscode.TextEditor): Promise<void> {
        const animation = this.activeAnimations.get(filePath)
        if (!animation || animation.animationCancelled) {
            return
        }

        // Clear streaming decorations
        this.fadedOverlayControllers.get(filePath)?.clear()
        this.activeLineControllers.get(filePath)?.clear()

        // Show GitHub-style diff after animation completes
        await this.applyGitHubDiffDecorations(filePath, editor, animation.originalContent, animation.newContent)

        // Clear timeouts
        this.animationTimeouts.delete(filePath)

        getLogger().info(`[DiffAnimationController] ✅ Animation completed with diff view for: ${filePath}`)
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

            // Apply content change
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
            // Restore final content before clearing
            const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)
            if (editor && animation.newContent) {
                const edit = new vscode.WorkspaceEdit()
                const fullRange = new vscode.Range(
                    editor.document.positionAt(0),
                    editor.document.positionAt(editor.document.getText().length)
                )
                edit.replace(editor.document.uri, fullRange, animation.newContent)
                void vscode.workspace.applyEdit(edit).then(
                    () => {
                        getLogger().info(`[DiffAnimationController] Restored final content for: ${filePath}`)
                    },
                    (error) => {
                        getLogger().error(
                            `[DiffAnimationController] Failed to restore final content for: ${filePath}: ${error}`
                        )
                    }
                )
            }
        }

        // Cancel animation if running
        this.cancelAnimation(filePath)

        // Clear all state for this file
        this.activeAnimations.delete(filePath)

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
        return animation ? !animation.isShowingStaticDiff && !animation.animationCancelled : false
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
        fadedOverlayDecorationType.dispose()
        activeLineDecorationType.dispose()
        githubAdditionDecorationType.dispose()
        githubDeletionDecorationType.dispose()
        deletionMarkerDecorationType.dispose()
    }
}
