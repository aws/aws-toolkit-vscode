/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DiffAnimationController - Simplified Static Diff View Only
 *
 * This controller now only handles:
 * 1. Storing animation data for static diff views
 * 2. Showing VS Code's built-in diff view when files are clicked from chat
 * 3. No more webview-based animations (handled by StreamingDiffController)
 */

import * as vscode from 'vscode'
import { getLogger } from 'aws-core-vscode/shared'
import { DiffAnimation, PartialUpdateOptions } from './types'
import { VSCodeIntegration } from './vscodeIntegration'

export { DiffAnimation, PartialUpdateOptions }

export class DiffAnimationController {
    private activeAnimations = new Map<string, DiffAnimation>()
    private vscodeIntegration: VSCodeIntegration

    constructor() {
        getLogger().info('[DiffAnimationController] 🚀 Initialized simplified diff controller (static diff only)')
        this.vscodeIntegration = new VSCodeIntegration()
    }

    public getAnimationData(filePath: string): DiffAnimation | undefined {
        return this.activeAnimations.get(filePath)
    }

    /**
     * Store animation data for later static diff view
     */
    public storeAnimationData(filePath: string, originalContent: string, newContent: string): void {
        const animation: DiffAnimation = {
            uri: vscode.Uri.file(filePath),
            originalContent,
            newContent,
            isShowingStaticDiff: false,
            animationCancelled: false,
            isFromChatClick: false,
        }
        this.activeAnimations.set(filePath, animation)
        getLogger().info(`[DiffAnimationController] 📦 Stored animation data for: ${filePath}`)
    }

    /**
     * Check if we should show static diff for a file
     */
    public shouldShowStaticDiff(filePath: string, newContent: string): boolean {
        return this.activeAnimations.has(filePath)
    }

    /**
     * Show VS Code's built-in diff view (for file tab clicks)
     */
    public async showVSCodeDiff(filePath: string, originalContent: string, newContent: string): Promise<void> {
        return this.vscodeIntegration.showVSCodeDiff(filePath, originalContent, newContent)
    }

    /**
     * Show static diff view using stored animation data
     */
    public async showStaticDiffView(filePath: string): Promise<void> {
        const animation = this.activeAnimations.get(filePath)
        if (!animation) {
            getLogger().warn(`[DiffAnimationController] No animation data found for: ${filePath}`)
            return
        }

        await this.showVSCodeDiff(filePath, animation.originalContent, animation.newContent)
    }

    /**
     * DEPRECATED: No longer used - streaming system handles all animations
     */
    public async startDiffAnimation(
        filePath: string,
        originalContent: string,
        newContent: string,
        isFromChatClick: boolean = false
    ): Promise<void> {
        getLogger().info(`[DiffAnimationController] ⚠️ startDiffAnimation is deprecated, use streaming system instead`)

        if (isFromChatClick) {
            await this.showVSCodeDiff(filePath, originalContent, newContent)
        } else {
            // Just store the data for later static diff view
            this.storeAnimationData(filePath, originalContent, newContent)
        }
    }

    /**
     * DEPRECATED: No longer used - streaming system handles all animations
     */
    public async startPartialDiffAnimation(
        filePath: string,
        originalContent: string,
        newContent: string,
        options: PartialUpdateOptions = {}
    ): Promise<void> {
        getLogger().info(
            `[DiffAnimationController] ⚠️ startPartialDiffAnimation is deprecated, use streaming system instead`
        )
        // Just store the data for later static diff view
        this.storeAnimationData(filePath, originalContent, newContent)
    }

    /**
     * DEPRECATED: No longer used
     */
    public stopDiffAnimation(filePath: string): void {
        this.activeAnimations.delete(filePath)
    }

    /**
     * DEPRECATED: No longer used
     */
    public stopAllAnimations(): void {
        this.activeAnimations.clear()
    }

    /**
     * DEPRECATED: No longer used
     */
    public isAnimating(filePath: string): boolean {
        return false // No animations in this controller anymore
    }

    /**
     * DEPRECATED: No longer used
     */
    public isShowingStaticDiff(filePath: string): boolean {
        return false // Static diff is handled by VSCode directly
    }

    /**
     * Get animation stats
     */
    public getAnimationStats(): { activeCount: number; filePaths: string[] } {
        return {
            activeCount: 0, // No active animations in this controller
            filePaths: Array.from(this.activeAnimations.keys()),
        }
    }

    /**
     * Dispose
     */
    public dispose(): void {
        getLogger().info('[DiffAnimationController] 💥 Disposing simplified controller')
        this.activeAnimations.clear()
    }
}
