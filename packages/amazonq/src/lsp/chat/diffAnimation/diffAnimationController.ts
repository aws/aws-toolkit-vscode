/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DiffAnimationController - Progressive Diff Animation with Smart Scanning
 *
 * Key Features:
 * 1. Progressive rendering - lines appear as they are scanned
 * 2. Smart region detection - only scans changed areas + context
 * 3. Yellow scanning line animation like Cline
 * 4. Auto-scroll with user override detection
 * 5. GitHub-style diff decorations
 */

import * as vscode from 'vscode'
import { getLogger } from 'aws-core-vscode/shared'
import { DiffAnimation, PartialUpdateOptions, AnimationHistory } from './types'
import { WebviewManager } from './webviewManager'
import { DiffAnalyzer } from './diffAnalyzer'
import { VSCodeIntegration } from './vscodeIntegration'

export { DiffAnimation, PartialUpdateOptions }

export class DiffAnimationController {
    private activeAnimations = new Map<string, DiffAnimation>()
    private fileAnimationHistory = new Map<string, AnimationHistory>()
    private animationTimeouts = new Map<string, NodeJS.Timeout[]>()
    private fileSnapshots = new Map<string, string>()

    // Component managers
    private webviewManager: WebviewManager
    private diffAnalyzer: DiffAnalyzer
    private vscodeIntegration: VSCodeIntegration

    constructor() {
        getLogger().info('[DiffAnimationController] 🚀 Initialized with progressive scanning animation')

        // Initialize component managers
        this.webviewManager = new WebviewManager()
        this.diffAnalyzer = new DiffAnalyzer()
        this.vscodeIntegration = new VSCodeIntegration()
    }

    public getAnimationData(filePath: string): DiffAnimation | undefined {
        return this.activeAnimations.get(filePath)
    }

    /**
     * Check if we should show static diff for a file
     */
    public shouldShowStaticDiff(filePath: string, newContent: string): boolean {
        const history = this.fileAnimationHistory.get(filePath)
        const animation = this.activeAnimations.get(filePath)

        // If we have active animation data, we should show static diff
        if (animation) {
            return true
        }

        // If we have history and it's not currently animating, show static diff
        if (history && !history.isCurrentlyAnimating) {
            return true
        }

        // For new files without history, check if we should show static diff
        // This handles the case where a file tab is clicked before any animation has occurred
        return false
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
     * Start a diff animation for a file
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

        if (isFromChatClick) {
            getLogger().info(`[DiffAnimationController] File clicked from chat, showing VS Code diff`)
            await this.showVSCodeDiff(filePath, originalContent, newContent)
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

            // Ensure the file exists and has the new content
            let doc: vscode.TextDocument
            try {
                doc = await vscode.workspace.openTextDocument(uri)
                this.fileSnapshots.set(filePath, doc.getText())
            } catch {
                // Create new file
                await vscode.workspace.fs.writeFile(uri, Buffer.from(''))
                doc = await vscode.workspace.openTextDocument(uri)
                this.fileSnapshots.set(filePath, '')
            }

            // Apply the new content
            const edit = new vscode.WorkspaceEdit()
            const fullRange = new vscode.Range(
                0,
                0,
                doc.lineCount > 0 ? doc.lineCount - 1 : 0,
                doc.lineCount > 0 ? doc.lineAt(Math.max(0, doc.lineCount - 1)).text.length : 0
            )
            edit.replace(uri, fullRange, newContent)
            await vscode.workspace.applyEdit(edit)
            await doc.save()

            // Calculate changed region for optimization
            const changedRegion = this.diffAnalyzer.calculateChangedRegion(originalContent, newContent)
            getLogger().info(
                `[DiffAnimationController] Changed region: lines ${changedRegion.startLine}-${changedRegion.endLine}`
            )

            // Create or reuse webview for this file
            const webview = await this.webviewManager.getOrCreateDiffWebview(filePath)

            // Start the progressive animation
            await this.animateDiffInWebview(filePath, webview, originalContent, newContent, animation, changedRegion)
        } catch (error) {
            getLogger().error(`[DiffAnimationController] ❌ Failed to start animation: ${error}`)
            this.stopDiffAnimation(filePath)
            throw error
        }
    }

    /**
     * Animate diff in webview progressively with smart scanning
     */
    private async animateDiffInWebview(
        filePath: string,
        webview: vscode.WebviewPanel,
        originalContent: string,
        newContent: string,
        animation: DiffAnimation,
        changedRegion: { startLine: number; endLine: number; totalLines: number }
    ): Promise<void> {
        try {
            // Parse diff and create scan plan
            const { leftLines, rightLines, scanPlan } = this.diffAnalyzer.createScanPlan(
                originalContent,
                newContent,
                changedRegion
            )

            // Clear and start scan
            await this.webviewManager.sendMessageToWebview(filePath, { command: 'clear' })

            await this.webviewManager.sendMessageToWebview(filePath, {
                command: 'startScan',
                totalLines: scanPlan.length,
            })

            // Pre-add lines that are before the scan region (context)
            for (let i = 0; i < Math.min(changedRegion.startLine, 3); i++) {
                if (leftLines[i]) {
                    await this.webviewManager.sendMessageToWebview(filePath, {
                        command: 'addLine',
                        side: 'left',
                        line: leftLines[i],
                        immediately: true,
                    })
                }
                if (rightLines[i]) {
                    await this.webviewManager.sendMessageToWebview(filePath, {
                        command: 'addLine',
                        side: 'right',
                        line: rightLines[i],
                        immediately: true,
                    })
                }
            }

            // Calculate animation speed
            const { scanDelay } = this.diffAnalyzer.calculateAnimationTiming(scanPlan.length)

            // Execute scan plan
            for (const scanItem of scanPlan) {
                if (animation.animationCancelled) {
                    break
                }

                // Add lines if not already added
                if (scanItem.leftLine && !scanItem.preAdded) {
                    await this.webviewManager.sendMessageToWebview(filePath, {
                        command: 'addLine',
                        side: 'left',
                        line: scanItem.leftLine,
                        immediately: false,
                    })
                }

                if (scanItem.rightLine && !scanItem.preAdded) {
                    await this.webviewManager.sendMessageToWebview(filePath, {
                        command: 'addLine',
                        side: 'right',
                        line: scanItem.rightLine,
                        immediately: false,
                    })
                }

                // Small delay to ensure lines are added
                await new Promise((resolve) => setTimeout(resolve, 10))

                // Scan the line
                await this.webviewManager.sendMessageToWebview(filePath, {
                    command: 'scanLine',
                    leftIndex: scanItem.leftIndex,
                    rightIndex: scanItem.rightIndex,
                    autoScroll: this.webviewManager.shouldAutoScrollForFile(filePath),
                })

                // Wait before next line
                await new Promise((resolve) => setTimeout(resolve, scanDelay))
            }

            // Add any remaining lines after scan region
            for (let i = changedRegion.endLine + 1; i < leftLines.length || i < rightLines.length; i++) {
                if (i < leftLines.length) {
                    await this.webviewManager.sendMessageToWebview(filePath, {
                        command: 'addLine',
                        side: 'left',
                        line: leftLines[i],
                        immediately: true,
                    })
                }
                if (i < rightLines.length) {
                    await this.webviewManager.sendMessageToWebview(filePath, {
                        command: 'addLine',
                        side: 'right',
                        line: rightLines[i],
                        immediately: true,
                    })
                }
            }

            // Complete animation
            await this.webviewManager.sendMessageToWebview(filePath, { command: 'completeScan' })

            // Update animation history
            this.updateAnimationComplete(filePath, newContent)

            getLogger().info(`[DiffAnimationController] ✅ Smart scanning completed for: ${filePath}`)

            // Auto-close after a delay if not from chat click
            if (!animation.isFromChatClick) {
                setTimeout(async () => {
                    this.webviewManager.closeDiffWebview(filePath)

                    // Optionally reopen the file in normal editor
                    try {
                        await this.vscodeIntegration.openFileInEditor(filePath)
                        getLogger().info(`[DiffAnimationController] Reopened file after animation: ${filePath}`)
                    } catch (error) {
                        getLogger().error(`[DiffAnimationController] Failed to reopen file: ${error}`)
                    }
                }, 3000)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationController] ❌ Animation failed: ${error}`)
            throw error
        }
    }

    /**
     * Show VS Code's built-in diff view (for file tab clicks)
     */
    public async showVSCodeDiff(filePath: string, originalContent: string, newContent: string): Promise<void> {
        return this.vscodeIntegration.showVSCodeDiff(filePath, originalContent, newContent)
    }

    /**
     * Show static diff view (reuse existing webview)
     */
    public async showStaticDiffView(filePath: string): Promise<void> {
        const animation = this.activeAnimations.get(filePath)
        if (!animation) {
            getLogger().warn(`[DiffAnimationController] No animation data found for: ${filePath}`)
            return
        }

        // Show VS Code diff for static view
        await this.showVSCodeDiff(filePath, animation.originalContent, animation.newContent)
    }

    /**
     * Start partial diff animation
     */
    public async startPartialDiffAnimation(
        filePath: string,
        originalContent: string,
        newContent: string,
        options: PartialUpdateOptions = {}
    ): Promise<void> {
        // For now, fall back to full animation
        // TODO: Implement partial updates in webview
        return this.startDiffAnimation(filePath, originalContent, newContent)
    }

    /**
     * Cancel ongoing animation
     */
    private cancelAnimation(filePath: string): void {
        const animation = this.activeAnimations.get(filePath)
        if (animation && !animation.isShowingStaticDiff) {
            animation.animationCancelled = true

            // Clear timeouts
            const timeouts = this.animationTimeouts.get(filePath)
            if (timeouts) {
                for (const timeout of timeouts) {
                    clearTimeout(timeout)
                }
                this.animationTimeouts.delete(filePath)
            }
        }
    }

    /**
     * Stop diff animation for a file
     */
    public stopDiffAnimation(filePath: string): void {
        getLogger().info(`[DiffAnimationController] 🛑 Stopping animation for: ${filePath}`)

        this.cancelAnimation(filePath)
        this.webviewManager.closeDiffWebview(filePath)

        this.activeAnimations.delete(filePath)
        this.fileSnapshots.delete(filePath)
        this.animationTimeouts.delete(filePath)
    }

    /**
     * Stop all animations
     */
    public stopAllAnimations(): void {
        getLogger().info('[DiffAnimationController] 🛑 Stopping all animations')
        for (const [filePath] of this.activeAnimations) {
            this.stopDiffAnimation(filePath)
        }
    }

    /**
     * Check if animating
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
     * Check if showing static diff
     */
    public isShowingStaticDiff(filePath: string): boolean {
        const animation = this.activeAnimations.get(filePath)
        return animation?.isShowingStaticDiff ?? false
    }

    /**
     * Get animation stats
     */
    public getAnimationStats(): { activeCount: number; filePaths: string[] } {
        return {
            activeCount: this.activeAnimations.size,
            filePaths: Array.from(this.activeAnimations.keys()),
        }
    }

    /**
     * Dispose
     */
    public dispose(): void {
        getLogger().info('[DiffAnimationController] 💥 Disposing controller')
        this.stopAllAnimations()

        // Dispose component managers
        this.webviewManager.dispose()

        // Clear all maps
        this.activeAnimations.clear()
        this.fileAnimationHistory.clear()
        this.animationTimeouts.clear()
        this.fileSnapshots.clear()
    }
}
