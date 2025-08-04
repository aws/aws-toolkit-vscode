/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from 'aws-core-vscode/shared'
import { StreamingDiffController } from './streamingDiffController'

export class DiffAnimationHandler implements vscode.Disposable {
    private streamingDiffController: StreamingDiffController
    private streamingSessions = new Map<
        string,
        { toolUseId: string; filePath: string; originalContent: string; startTime: number }
    >()

    constructor() {
        this.streamingDiffController = new StreamingDiffController()
    }

    public async startStreamingDiffSession(
        toolUseId: string,
        filePath: string,
        providedOriginalContent?: string
    ): Promise<void> {
        try {
            let originalContent = providedOriginalContent || ''

            if (!providedOriginalContent) {
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
                    originalContent = document.getText()
                } catch {
                    originalContent = ''
                }
            }

            this.streamingSessions.set(toolUseId, {
                toolUseId,
                filePath,
                originalContent,
                startTime: Date.now(),
            })

            await this.streamingDiffController.openStreamingDiffView(toolUseId, filePath, originalContent)
        } catch (error) {
            getLogger().error(`Failed to start streaming session for ${toolUseId}: ${error}`)
        }
    }

    public async startStreamingWithOriginalContent(
        toolUseId: string,
        filePath: string,
        originalContent: string
    ): Promise<void> {
        return this.startStreamingDiffSession(toolUseId, filePath, originalContent)
    }

    public async streamContentUpdate(
        toolUseId: string,
        partialContent: string,
        isFinal: boolean = false
    ): Promise<void> {
        const session = this.streamingSessions.get(toolUseId)
        if (!session) {
            return
        }

        if (!isFinal && partialContent.trim() === '') {
            return
        }

        try {
            await this.streamingDiffController.streamContentUpdate(toolUseId, partialContent, isFinal)

            if (isFinal) {
                this.streamingSessions.delete(toolUseId)
            }
        } catch (error) {
            getLogger().error(`Failed to stream content for ${toolUseId}: ${error}`)
            this.streamingSessions.delete(toolUseId)
        }
    }

    public isStreamingActive(toolUseId: string): boolean {
        return this.streamingSessions.has(toolUseId) && this.streamingDiffController.isStreamingActive(toolUseId)
    }

    public getStreamingStats(toolUseId: string): any {
        const session = this.streamingSessions.get(toolUseId)
        const streamingStats = this.streamingDiffController.getStreamingStats(toolUseId)
        return {
            sessionExists: !!session,
            sessionDuration: session ? Date.now() - session.startTime : 0,
            filePath: session?.filePath,
            ...streamingStats,
        }
    }

    public async dispose(): Promise<void> {
        this.streamingSessions.clear()
        this.streamingDiffController.dispose()
    }
}
