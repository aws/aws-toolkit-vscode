/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from 'aws-core-vscode/shared'
import { QueuedAnimation, PendingFileWrite } from './types'
import { FileSystemManager } from './fileSystemManager'

export class AnimationQueueManager {
    // Track which files are being animated
    private animatingFiles = new Set<string>()
    // Animation queue for handling multiple changes
    private animationQueue = new Map<string, QueuedAnimation[]>()

    constructor(
        private fileSystemManager: FileSystemManager,
        private startFullAnimation: (
            filePath: string,
            originalContent: string,
            newContent: string,
            toolUseId: string
        ) => Promise<void>,
        private startPartialAnimation: (
            filePath: string,
            originalContent: string,
            newContent: string,
            changeLocation: { startLine: number; endLine: number },
            toolUseId: string
        ) => Promise<void>
    ) {}

    /**
     * Check if a file is currently being animated
     */
    public isAnimating(filePath: string): boolean {
        return this.animatingFiles.has(filePath)
    }

    /**
     * Mark file as animating
     */
    public markAsAnimating(filePath: string): void {
        this.animatingFiles.add(filePath)
    }

    /**
     * Mark file as no longer animating
     */
    public markAsNotAnimating(filePath: string): void {
        this.animatingFiles.delete(filePath)
    }

    /**
     * Queue an animation for later processing
     */
    public queueAnimation(filePath: string, animation: QueuedAnimation): void {
        const queue = this.animationQueue.get(filePath) || []
        queue.push(animation)
        this.animationQueue.set(filePath, queue)
        getLogger().info(`[AnimationQueueManager] 📋 Queued animation for ${filePath} (queue size: ${queue.length})`)
    }

    /**
     * Start animation and handle queuing logic
     */
    public async startAnimation(filePath: string, pendingWrite: PendingFileWrite, newContent: string): Promise<void> {
        // If already animating, queue the change
        if (this.isAnimating(filePath)) {
            this.queueAnimation(filePath, {
                originalContent: pendingWrite.originalContent,
                newContent,
                toolUseId: pendingWrite.toolUseId,
                changeLocation: pendingWrite.changeLocation,
            })
            return
        }

        // Mark as animating
        this.markAsAnimating(filePath)

        try {
            // Check if we have change location for partial update
            if (pendingWrite.changeLocation) {
                // Use partial animation for targeted changes
                await this.startPartialAnimation(
                    filePath,
                    pendingWrite.originalContent,
                    newContent,
                    pendingWrite.changeLocation,
                    pendingWrite.toolUseId
                )
            } else {
                // Use full file animation
                await this.startFullAnimation(
                    filePath,
                    pendingWrite.originalContent,
                    newContent,
                    pendingWrite.toolUseId
                )
            }

            // Process queued animations
            await this.processQueuedAnimations(filePath)
        } finally {
            // Always mark as not animating when done
            this.markAsNotAnimating(filePath)
        }
    }

    /**
     * Process queued animations for a file
     */
    private async processQueuedAnimations(filePath: string): Promise<void> {
        const queue = this.animationQueue.get(filePath)
        if (!queue || queue.length === 0) {
            return
        }

        const next = queue.shift()
        if (!next) {
            return
        }

        getLogger().info(
            `[AnimationQueueManager] 🎯 Processing queued animation for ${filePath} (${queue.length} remaining)`
        )

        // Use the current file content as the "original" for the next animation
        const currentContent = await this.fileSystemManager.getCurrentFileContent(filePath)

        // Create a new pending write for the queued animation
        const queuedPendingWrite: PendingFileWrite = {
            filePath,
            originalContent: currentContent,
            toolUseId: next.toolUseId,
            timestamp: Date.now(),
            changeLocation: next.changeLocation,
        }

        // Recursively start the next animation
        await this.startAnimation(filePath, queuedPendingWrite, next.newContent)
    }

    /**
     * Get animation statistics
     */
    public getAnimationStats(): { animatingCount: number; queuedCount: number; filePaths: string[] } {
        let queuedCount = 0
        for (const queue of this.animationQueue.values()) {
            queuedCount += queue.length
        }

        return {
            animatingCount: this.animatingFiles.size,
            queuedCount,
            filePaths: Array.from(this.animatingFiles),
        }
    }

    /**
     * Clear all queues and reset state
     */
    public clearAll(): void {
        this.animatingFiles.clear()
        this.animationQueue.clear()
        getLogger().info('[AnimationQueueManager] 🧹 Cleared all animation queues and state')
    }

    /**
     * Clear queue for a specific file
     */
    public clearFileQueue(filePath: string): void {
        this.animationQueue.delete(filePath)
        this.markAsNotAnimating(filePath)
        getLogger().info(`[AnimationQueueManager] 🧹 Cleared queue for ${filePath}`)
    }
}
