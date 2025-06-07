/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from 'aws-core-vscode/shared'
import { diffLines, Change } from 'diff'

export interface DiffAnimation {
    uri: vscode.Uri
    originalContent: string
    newContent: string
    decorations: {
        additions: vscode.DecorationOptions[]
        deletions: vscode.DecorationOptions[]
    }
}

export class DiffAnimationController {
    // Make decorations more visible with stronger colors and animations
    private readonly additionDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(0, 255, 0, 0.3)',
        isWholeLine: true,
        border: '2px solid rgba(0, 255, 0, 0.8)',
        borderRadius: '3px',
        after: {
            contentText: ' ✨ Added by Amazon Q',
            color: 'rgba(0, 255, 0, 1)',
            fontWeight: 'bold',
            fontStyle: 'italic',
            margin: '0 0 0 30px',
        },
        // Add gutter icon for better visibility
        gutterIconSize: 'contain',
        overviewRulerColor: 'rgba(0, 255, 0, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
    })

    private readonly deletionDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 0, 0, 0.3)',
        isWholeLine: true,
        border: '2px solid rgba(255, 0, 0, 0.8)',
        borderRadius: '3px',
        textDecoration: 'line-through',
        opacity: '0.6',
        after: {
            contentText: ' ❌ Removed by Amazon Q',
            color: 'rgba(255, 0, 0, 1)',
            fontWeight: 'bold',
            fontStyle: 'italic',
            margin: '0 0 0 30px',
        },
        gutterIconSize: 'contain',
        overviewRulerColor: 'rgba(255, 0, 0, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
    })

    // Highlight decoration for the current animating line
    private readonly currentLineDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.2)',
        isWholeLine: true,
        border: '2px solid rgba(255, 255, 0, 1)',
        borderRadius: '3px',
    })

    // Fade decoration for completed animations
    private readonly fadeDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(0, 255, 0, 0.1)',
        border: '1px solid rgba(0, 255, 0, 0.3)',
        after: {
            contentText: ' ✓',
            color: 'rgba(0, 255, 0, 0.6)',
            margin: '0 0 0 10px',
        },
    })

    private activeAnimations = new Map<string, DiffAnimation>()
    private animationTimeouts = new Map<string, NodeJS.Timeout[]>()
    private animationSpeed = 50 // Faster for better real-time feel
    private scrollDelay = 25 // Faster scrolling
    private fadeDelay = 3000 // How long to keep fade decorations
    private groupProximityLines = 5 // Lines within this distance are grouped

    constructor() {
        getLogger().info('[DiffAnimationController] 🚀 Initialized')
    }

    /**
     * Start a diff animation for a file
     */
    public async startDiffAnimation(filePath: string, originalContent: string, newContent: string): Promise<void> {
        getLogger().info(`[DiffAnimationController] 🎬 Starting diff animation for: ${filePath}`)
        getLogger().info(
            `[DiffAnimationController] 📊 Original: ${originalContent.length} chars, New: ${newContent.length} chars`
        )

        try {
            // Stop any existing animation for this file
            this.stopDiffAnimation(filePath)

            const uri = vscode.Uri.file(filePath)

            // Open or create the document
            let document: vscode.TextDocument
            let editor: vscode.TextEditor

            try {
                // Try to find if document is already open
                const openEditor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)

                if (openEditor) {
                    editor = openEditor
                    document = openEditor.document
                    getLogger().info(`[DiffAnimationController] 📄 Found open editor for: ${filePath}`)
                } else {
                    // Open the document
                    document = await vscode.workspace.openTextDocument(uri)
                    editor = await vscode.window.showTextDocument(document, {
                        preview: false,
                        preserveFocus: false,
                        viewColumn: vscode.ViewColumn.Active,
                    })
                    getLogger().info(`[DiffAnimationController] 📄 Opened document: ${filePath}`)
                }
            } catch (error) {
                getLogger().info(`[DiffAnimationController] 🆕 File doesn't exist, creating new file`)
                // Create the file with original content first
                await vscode.workspace.fs.writeFile(uri, Buffer.from(originalContent))
                document = await vscode.workspace.openTextDocument(uri)
                editor = await vscode.window.showTextDocument(document, {
                    preview: false,
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.Active,
                })
            }

            // Calculate diff
            const changes = diffLines(originalContent, newContent)
            getLogger().info(`[DiffAnimationController] 📊 Calculated ${changes.length} change blocks`)

            // Store animation state
            const decorations = this.calculateDecorations(changes, document, newContent)
            const animation: DiffAnimation = {
                uri,
                originalContent,
                newContent,
                decorations,
            }
            this.activeAnimations.set(filePath, animation)

            // Apply the new content
            const edit = new vscode.WorkspaceEdit()
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
            edit.replace(uri, fullRange, newContent)
            const applied = await vscode.workspace.applyEdit(edit)

            if (!applied) {
                throw new Error('Failed to apply edit')
            }

            // Wait for the document to update
            await new Promise((resolve) => setTimeout(resolve, 100))

            // Re-get the document and editor after content change
            document = await vscode.workspace.openTextDocument(uri)
            const currentEditor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)

            if (currentEditor) {
                editor = currentEditor
            } else {
                editor = await vscode.window.showTextDocument(document, {
                    preview: false,
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.Active,
                })
            }

            // Start the animation
            await this.animateDiff(editor, decorations, filePath)
        } catch (error) {
            getLogger().error(`[DiffAnimationController] ❌ Failed to start diff animation: ${error}`)
            throw error
        }
    }

    /**
     * Support for incremental diff animation (for real-time updates)
     */
    public async startIncrementalDiffAnimation(
        filePath: string,
        previousContent: string,
        currentContent: string,
        isFirstUpdate: boolean = false
    ): Promise<void> {
        getLogger().info(`[DiffAnimationController] 🎬 Starting incremental animation for: ${filePath}`)

        // If it's the first update or empty previous content, use full animation
        if (isFirstUpdate || previousContent === '') {
            return this.startDiffAnimation(filePath, previousContent, currentContent)
        }

        // For incremental updates, calculate diff from previous state
        try {
            const uri = vscode.Uri.file(filePath)
            const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === filePath)

            if (!editor) {
                // If editor not found, fall back to full animation
                return this.startDiffAnimation(filePath, previousContent, currentContent)
            }

            // Calculate incremental changes
            const incrementalChanges = diffLines(previousContent, currentContent)
            const hasChanges = incrementalChanges.some((change) => change.added || change.removed)

            if (!hasChanges) {
                getLogger().info(`[DiffAnimationController] ℹ️ No changes detected in incremental update`)
                return
            }

            // Apply content change
            const edit = new vscode.WorkspaceEdit()
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            )
            edit.replace(uri, fullRange, currentContent)
            await vscode.workspace.applyEdit(edit)

            // Calculate decorations for new changes only
            const decorations = this.calculateDecorations(incrementalChanges, editor.document, currentContent)

            // Animate only the new changes
            await this.animateIncrementalDiff(editor, decorations, filePath)
        } catch (error) {
            getLogger().error(
                `[DiffAnimationController] ❌ Incremental animation failed, falling back to full: ${error}`
            )
            return this.startDiffAnimation(filePath, previousContent, currentContent)
        }
    }

    /**
     * Calculate decorations based on diff changes for the NEW content
     */
    private calculateDecorations(
        changes: Change[],
        document: vscode.TextDocument,
        newContent: string
    ): DiffAnimation['decorations'] {
        const additions: vscode.DecorationOptions[] = []
        const deletions: vscode.DecorationOptions[] = []

        // Split new content into lines for accurate mapping
        let currentLineInNew = 0

        getLogger().info(`[DiffAnimationController] 📊 Document has ${document.lineCount} lines`)

        for (let i = 0; i < changes.length; i++) {
            const change = changes[i]
            const changeLines = change.value.split('\n').filter((line) => line !== '')
            const lineCount = changeLines.length

            getLogger().info(
                `[DiffAnimationController] Change[${i}]: ${change.added ? 'ADD' : change.removed ? 'REMOVE' : 'KEEP'} ${lineCount} lines`
            )

            if (change.added) {
                // For additions, highlight the lines in the new content
                for (let j = 0; j < lineCount && currentLineInNew < document.lineCount; j++) {
                    try {
                        const line = document.lineAt(currentLineInNew)
                        additions.push({
                            range: line.range,
                            hoverMessage: `Added: ${line.text}`,
                        })
                        getLogger().info(
                            `[DiffAnimationController] ➕ Added line ${currentLineInNew}: "${line.text.substring(0, 50)}..."`
                        )
                        currentLineInNew++
                    } catch (error) {
                        getLogger().warn(
                            `[DiffAnimationController] ⚠️ Could not highlight line ${currentLineInNew}: ${error}`
                        )
                        currentLineInNew++
                    }
                }
            } else if (change.removed) {
                // For deletions, we track them but can't show in new content
                for (let j = 0; j < lineCount; j++) {
                    getLogger().info(
                        `[DiffAnimationController] ➖ Removed line: "${changeLines[j]?.substring(0, 50) || ''}..."`
                    )
                }
            } else {
                // Unchanged lines
                currentLineInNew += lineCount
            }
        }

        getLogger().info(
            `[DiffAnimationController] 📊 Final decorations: ${additions.length} additions, ${deletions.length} deletions`
        )
        return { additions, deletions }
    }

    /**
     * Animate diff changes progressively with smooth scrolling
     */
    private async animateDiff(
        editor: vscode.TextEditor,
        decorations: DiffAnimation['decorations'],
        filePath: string
    ): Promise<void> {
        const { additions } = decorations
        const timeouts: NodeJS.Timeout[] = []

        getLogger().info(`[DiffAnimationController] 🎬 Starting animation with ${additions.length} additions`)

        // Clear previous decorations
        editor.setDecorations(this.additionDecorationType, [])
        editor.setDecorations(this.deletionDecorationType, [])
        editor.setDecorations(this.currentLineDecorationType, [])

        // Group additions by proximity for smoother scrolling
        const additionGroups = this.groupAdditionsByProximity(additions)
        let currentGroupIndex = 0
        let additionsShown = 0

        // If no additions, just show a completion message
        if (additions.length === 0) {
            getLogger().info(`[DiffAnimationController] ℹ️ No additions to animate`)
            return
        }

        // Animate additions with progressive reveal and smart scrolling
        for (let i = 0; i < additions.length; i++) {
            const timeout = setTimeout(async () => {
                if (!vscode.window.visibleTextEditors.includes(editor)) {
                    getLogger().warn(`[DiffAnimationController] ⚠️ Editor closed, stopping animation`)
                    this.stopDiffAnimation(filePath)
                    return
                }

                const currentAdditions = additions.slice(0, i + 1)
                const currentAddition = additions[i]

                // Show all additions up to current
                editor.setDecorations(this.additionDecorationType, currentAdditions)

                // Highlight current line being added
                editor.setDecorations(this.currentLineDecorationType, [currentAddition])

                // Clear current line highlight after a short delay
                setTimeout(() => {
                    editor.setDecorations(this.currentLineDecorationType, [])
                }, this.animationSpeed * 0.8)

                // Smart scrolling logic
                const currentGroup = additionGroups[currentGroupIndex]
                const isLastInGroup = currentGroup && i === currentGroup[currentGroup.length - 1].index
                const shouldScroll = this.shouldScrollToLine(editor, currentAddition.range)

                if (shouldScroll || isLastInGroup) {
                    // Smooth scroll to the line
                    setTimeout(() => {
                        if (!vscode.window.visibleTextEditors.includes(editor)) {
                            return
                        }

                        const revealType = this.getRevealType(editor, currentAddition.range, i === 0)
                        editor.revealRange(currentAddition.range, revealType)

                        // Also set cursor position for better visibility
                        const newSelection = new vscode.Selection(
                            currentAddition.range.start,
                            currentAddition.range.start
                        )
                        editor.selection = newSelection
                    }, this.scrollDelay)

                    // Move to next group if we're at the end of current group
                    if (isLastInGroup && currentGroupIndex < additionGroups.length - 1) {
                        currentGroupIndex++
                    }
                }

                additionsShown++
                getLogger().info(
                    `[DiffAnimationController] 🎯 Animated ${additionsShown}/${additions.length} additions`
                )
            }, i * this.animationSpeed)

            timeouts.push(timeout)
        }

        // Add final timeout to fade decorations after animation
        const fadeTimeout = setTimeout(
            () => {
                if (!vscode.window.visibleTextEditors.includes(editor)) {
                    getLogger().warn(`[DiffAnimationController] ⚠️ Editor closed before fade`)
                    return
                }

                // Gradually fade out decorations
                editor.setDecorations(this.additionDecorationType, [])
                editor.setDecorations(this.fadeDecorationType, additions)

                // Remove all decorations after fade
                setTimeout(() => {
                    editor.setDecorations(this.fadeDecorationType, [])
                    this.activeAnimations.delete(filePath)
                    getLogger().info(`[DiffAnimationController] ✅ Animation fully completed for ${filePath}`)
                }, this.fadeDelay)

                getLogger().info(`[DiffAnimationController] 🎨 Animation fading for ${filePath}`)
            },
            additions.length * this.animationSpeed + 500
        )

        timeouts.push(fadeTimeout)
        this.animationTimeouts.set(filePath, timeouts)
    }

    /**
     * Animate incremental changes (optimized for real-time updates)
     */
    private async animateIncrementalDiff(
        editor: vscode.TextEditor,
        decorations: DiffAnimation['decorations'],
        filePath: string
    ): Promise<void> {
        const { additions } = decorations

        if (additions.length === 0) {
            getLogger().info(`[DiffAnimationController] ℹ️ No incremental changes to animate`)
            return
        }

        // For incremental updates, show all changes immediately with a flash effect
        editor.setDecorations(this.currentLineDecorationType, additions)

        // Flash effect
        setTimeout(() => {
            editor.setDecorations(this.currentLineDecorationType, [])
            editor.setDecorations(this.additionDecorationType, additions)
        }, 200)

        // Fade after a shorter delay for incremental updates
        setTimeout(() => {
            editor.setDecorations(this.additionDecorationType, [])
            editor.setDecorations(this.fadeDecorationType, additions)

            setTimeout(() => {
                editor.setDecorations(this.fadeDecorationType, [])
            }, this.fadeDelay / 2)
        }, 1000)

        // Scroll to first change
        if (additions.length > 0 && this.shouldScrollToLine(editor, additions[0].range)) {
            editor.revealRange(additions[0].range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
        }
    }

    /**
     * Group additions by proximity for smarter scrolling
     */
    private groupAdditionsByProximity(
        additions: vscode.DecorationOptions[]
    ): Array<Array<{ range: vscode.Range; index: number }>> {
        const groups: Array<Array<{ range: vscode.Range; index: number }>> = []
        let currentGroup: Array<{ range: vscode.Range; index: number }> = []

        for (let i = 0; i < additions.length; i++) {
            const addition = additions[i]

            if (currentGroup.length === 0) {
                currentGroup.push({ range: addition.range, index: i })
            } else {
                const lastInGroup = currentGroup[currentGroup.length - 1]
                const distance = addition.range.start.line - lastInGroup.range.end.line

                // Group additions that are within proximity
                if (distance <= this.groupProximityLines) {
                    currentGroup.push({ range: addition.range, index: i })
                } else {
                    groups.push(currentGroup)
                    currentGroup = [{ range: addition.range, index: i }]
                }
            }
        }

        if (currentGroup.length > 0) {
            groups.push(currentGroup)
        }

        getLogger().info(
            `[DiffAnimationController] 📊 Grouped ${additions.length} additions into ${groups.length} groups`
        )
        return groups
    }

    /**
     * Determine if we should scroll to a line
     */
    private shouldScrollToLine(editor: vscode.TextEditor, range: vscode.Range): boolean {
        const visibleRange = editor.visibleRanges[0]
        if (!visibleRange) {
            return true
        }

        const line = range.start.line
        const visibleStart = visibleRange.start.line
        const visibleEnd = visibleRange.end.line
        const buffer = 5 // Lines of buffer at top/bottom

        // Scroll if line is outside visible range with buffer
        return line < visibleStart + buffer || line > visibleEnd - buffer
    }

    /**
     * Get appropriate reveal type based on context
     */
    private getRevealType(
        editor: vscode.TextEditor,
        range: vscode.Range,
        isFirst: boolean
    ): vscode.TextEditorRevealType {
        const visibleRange = editor.visibleRanges[0]
        const targetLine = range.start.line

        if (isFirst) {
            // First addition - center it
            return vscode.TextEditorRevealType.InCenter
        } else if (!visibleRange || targetLine < visibleRange.start.line || targetLine > visibleRange.end.line) {
            // Line is outside visible range - center it
            return vscode.TextEditorRevealType.InCenter
        } else {
            // Line is visible - use minimal scrolling
            return vscode.TextEditorRevealType.InCenterIfOutsideViewport
        }
    }

    /**
     * Stop diff animation for a file
     */
    public stopDiffAnimation(filePath: string): void {
        getLogger().info(`[DiffAnimationController] 🛑 Stopping animation for: ${filePath}`)

        const timeouts = this.animationTimeouts.get(filePath)
        if (timeouts) {
            for (const timeout of timeouts) {
                clearTimeout(timeout)
            }
            this.animationTimeouts.delete(filePath)
        }

        this.activeAnimations.delete(filePath)

        // Clear decorations if editor is still open
        const editor = vscode.window.visibleTextEditors.find((e) => e.document.fileName === filePath)
        if (editor) {
            editor.setDecorations(this.additionDecorationType, [])
            editor.setDecorations(this.deletionDecorationType, [])
            editor.setDecorations(this.currentLineDecorationType, [])
            editor.setDecorations(this.fadeDecorationType, [])
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
     * Set animation speed (ms per line)
     */
    public setAnimationSpeed(speed: number): void {
        this.animationSpeed = Math.max(10, Math.min(500, speed))
        getLogger().info(`[DiffAnimationController] ⚡ Animation speed set to: ${this.animationSpeed}ms`)
    }

    /**
     * Check if an animation is currently active for a file
     */
    public isAnimating(filePath: string): boolean {
        return this.activeAnimations.has(filePath)
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
        this.additionDecorationType.dispose()
        this.deletionDecorationType.dispose()
        this.currentLineDecorationType.dispose()
        this.fadeDecorationType.dispose()
    }
}
