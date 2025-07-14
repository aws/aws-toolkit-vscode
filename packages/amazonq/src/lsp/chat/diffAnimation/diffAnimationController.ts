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
import { DiffAnimation, PartialUpdateOptions } from './types'
import { VSCodeIntegration } from './vscodeIntegration'

export { DiffAnimation, PartialUpdateOptions }

export class DiffAnimationController {
    private activeAnimations = new Map<string, DiffAnimation>()
    private vscodeIntegration: VSCodeIntegration

    constructor() {
        this.vscodeIntegration = new VSCodeIntegration()
    }

    public getAnimationData(filePath: string): DiffAnimation | undefined {
        return this.activeAnimations.get(filePath)
    }

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
    }

    public shouldShowStaticDiff(filePath: string, newContent: string): boolean {
        return this.activeAnimations.has(filePath)
    }

    public async showVSCodeDiff(filePath: string, originalContent: string, newContent: string): Promise<void> {
        return this.vscodeIntegration.showVSCodeDiff(filePath, originalContent, newContent)
    }

    public async showStaticDiffView(filePath: string): Promise<void> {
        const animation = this.activeAnimations.get(filePath)
        if (!animation) {
            return
        }
        await this.showVSCodeDiff(filePath, animation.originalContent, animation.newContent)
    }

    public async startDiffAnimation(
        filePath: string,
        originalContent: string,
        newContent: string,
        isFromChatClick: boolean = false
    ): Promise<void> {
        if (isFromChatClick) {
            await this.showVSCodeDiff(filePath, originalContent, newContent)
        } else {
            this.storeAnimationData(filePath, originalContent, newContent)
        }
    }

    public async startPartialDiffAnimation(
        filePath: string,
        originalContent: string,
        newContent: string,
        options: PartialUpdateOptions = {}
    ): Promise<void> {
        this.storeAnimationData(filePath, originalContent, newContent)
    }

    public stopDiffAnimation(filePath: string): void {
        this.activeAnimations.delete(filePath)
    }

    public stopAllAnimations(): void {
        this.activeAnimations.clear()
    }

    public isAnimating(filePath: string): boolean {
        return false
    }

    public isShowingStaticDiff(filePath: string): boolean {
        return false
    }

    public getAnimationStats(): { activeCount: number; filePaths: string[] } {
        return {
            activeCount: 0,
            filePaths: Array.from(this.activeAnimations.keys()),
        }
    }

    public dispose(): void {
        this.activeAnimations.clear()
    }
}
