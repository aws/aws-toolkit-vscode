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

    /**
     * Handle streaming chunk processing for diff animations
     */
    public async handleStreamingChunk(
        streamingChunk: any,
        initializingStreamsByFile: Map<string, Set<string>>,
        processedChunks: Map<string, Set<string>>
    ): Promise<void> {
        // Handle fsReplace streaming chunks separately
        if (streamingChunk.toolName === 'fsReplace') {
            try {
                const contentHash = streamingChunk.content
                    ? `${streamingChunk.content.substring(0, 50)}-${streamingChunk.content.length}`
                    : 'empty'
                const chunkHash = `${streamingChunk.toolUseId}-${contentHash}-${streamingChunk.fsWriteParams?.pairIndex || 0}-${streamingChunk.isComplete}`

                if (!processedChunks.has(streamingChunk.toolUseId)) {
                    processedChunks.set(streamingChunk.toolUseId, new Set())
                }

                const toolChunks = processedChunks.get(streamingChunk.toolUseId)!

                if (streamingChunk.fsWriteParams?.command === 'fsReplace_diffPair') {
                    if (toolChunks.has(chunkHash)) {
                        return
                    }
                } else {
                    const simpleHash = `${streamingChunk.toolUseId}-${streamingChunk.content?.length || 0}`
                    if (toolChunks.has(simpleHash) && streamingChunk.isComplete) {
                        return
                    }
                    toolChunks.add(simpleHash)
                }

                toolChunks.add(chunkHash)

                const filePath = streamingChunk.filePath
                const isAlreadyInitializing =
                    filePath &&
                    initializingStreamsByFile.has(filePath) &&
                    initializingStreamsByFile.get(filePath)!.has(streamingChunk.toolUseId)

                if (!this.isStreamingActive(streamingChunk.toolUseId) && filePath && !isAlreadyInitializing) {
                    if (!initializingStreamsByFile.has(filePath)) {
                        initializingStreamsByFile.set(filePath, new Set())
                    }
                    initializingStreamsByFile.get(filePath)!.add(streamingChunk.toolUseId)

                    try {
                        await this.startStreamingDiffSession(streamingChunk.toolUseId, filePath)
                    } catch (error) {
                        getLogger().error(
                            `Failed to initialize fsReplace streaming session for ${streamingChunk.toolUseId}: ${error}`
                        )
                    } finally {
                        if (filePath && initializingStreamsByFile.has(filePath)) {
                            const toolUseIds = initializingStreamsByFile.get(filePath)!
                            toolUseIds.delete(streamingChunk.toolUseId)
                            if (toolUseIds.size === 0) {
                                initializingStreamsByFile.delete(filePath)
                            }
                        }
                    }
                }

                if (streamingChunk.fsWriteParams) {
                    if (this.streamingDiffController && (this.streamingDiffController as any).updateFsWriteParams) {
                        ;(this.streamingDiffController as any).updateFsWriteParams(
                            streamingChunk.toolUseId,
                            streamingChunk.fsWriteParams
                        )
                    }
                }

                await this.streamContentUpdate(
                    streamingChunk.toolUseId,
                    streamingChunk.content || '',
                    streamingChunk.isComplete || false
                )

                if (!streamingChunk.isComplete || !streamingChunk.filePath) {
                    return
                }

                const toolUseIds = initializingStreamsByFile.get(streamingChunk.filePath)
                if (!toolUseIds) {
                    return
                }

                toolUseIds.delete(streamingChunk.toolUseId)

                if (toolUseIds.size === 0) {
                    initializingStreamsByFile.delete(streamingChunk.filePath)
                }
            } catch (error) {
                getLogger().error(`Failed to process fsReplace streaming chunk: ${error}`)
                initializingStreamsByFile.delete(streamingChunk.toolUseId)
            }
            return
        }

        try {
            const filePath = streamingChunk.filePath
            const isAlreadyInitializing =
                filePath &&
                initializingStreamsByFile.has(filePath) &&
                initializingStreamsByFile.get(filePath)!.has(streamingChunk.toolUseId)

            if (!this.isStreamingActive(streamingChunk.toolUseId) && filePath && !isAlreadyInitializing) {
                if (!initializingStreamsByFile.has(filePath)) {
                    initializingStreamsByFile.set(filePath, new Set())
                }
                initializingStreamsByFile.get(filePath)!.add(streamingChunk.toolUseId)

                try {
                    await this.startStreamingDiffSession(streamingChunk.toolUseId, filePath)
                } catch (error) {
                    getLogger().error(
                        `Failed to initialize streaming session for ${streamingChunk.toolUseId}: ${error}`
                    )
                    throw error
                } finally {
                    if (filePath && initializingStreamsByFile.has(filePath)) {
                        const toolUseIds = initializingStreamsByFile.get(filePath)!
                        toolUseIds.delete(streamingChunk.toolUseId)
                        if (toolUseIds.size === 0) {
                            initializingStreamsByFile.delete(filePath)
                        }
                    }
                }
            }

            if (streamingChunk.fsWriteParams) {
                if (this.streamingDiffController && (this.streamingDiffController as any).updateFsWriteParams) {
                    ;(this.streamingDiffController as any).updateFsWriteParams(
                        streamingChunk.toolUseId,
                        streamingChunk.fsWriteParams
                    )
                }
            }

            await this.streamContentUpdate(
                streamingChunk.toolUseId,
                streamingChunk.content || '',
                streamingChunk.isComplete || false
            )

            if (!streamingChunk.isComplete || !streamingChunk.filePath) {
                return
            }

            const toolUseIds = initializingStreamsByFile.get(streamingChunk.filePath)
            if (!toolUseIds) {
                return
            }

            toolUseIds.delete(streamingChunk.toolUseId)

            if (toolUseIds.size === 0) {
                initializingStreamsByFile.delete(streamingChunk.filePath)
            }
        } catch (error) {
            getLogger().error(`Failed to process streaming chunk: ${error}`)
        }
    }

    public async dispose(): Promise<void> {
        this.streamingSessions.clear()
        this.streamingDiffController.dispose()
    }
}
