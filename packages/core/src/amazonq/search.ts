/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../shared/logger/logger'
import { CurrentWsFolders, collectFiles } from '../shared/utilities/workspaceUtils'

import * as CodeWhispererConstants from '../codewhisperer/models/constants'
import { Chunk, splitFileToChunks } from '../codewhisperer/util/supplementalContext/crossFileContextUtil'
import { Any } from '../shared/utilities/typeConstructors'

function getProjectPaths() {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw Error('No workspace folders found')
    }
    return workspaceFolders.map(folder => folder.uri.fsPath)
}

export class Search {
    static #instance: Search

    public static get instance() {
        return (this.#instance ??= new this())
    }

    constructor() {
        this.store = new Map<string, Any>()
        this.chunkStore = new Map<string, Chunk>()
    }

    task = 'feature-extraction'
    model = 'Xenova/sentence_bert'

    private pipelinePromise: Promise<any> | undefined
    private store: Map<string, Any>
    private chunkStore: Map<string, Chunk>

    async buildIndex() {
        const { pipeline, env } = await import('@xenova/transformers')
        const pipe = await (this.pipelinePromise ??= pipeline('feature-extraction', this.model))
        // Skip initial check for local models, since we are not loading any local models.
        env.allowLocalModels = false

        env.backends.onnx.wasm.numThreads = 10
        getLogger().info(`NEW: Starting to build vector index of project`)
        const files = await collectFiles(
            getProjectPaths(),
            vscode.workspace.workspaceFolders as CurrentWsFolders,
            true,
            CodeWhispererConstants.projectScanPayloadSizeLimitBytes
        )

        getLogger().info(`NEW: Found ${files.length} files in current project ${getProjectPaths()}`)
        for (const file of files) {
            const chunks = await splitFileToChunks(file.fileUri.fsPath, 10)
            for (const c of chunks) {
                try {
                    const result = await pipe(c.content, { pooling: 'mean', normalize: true })
                    const key = c.fileName + '|' + c.index
                    this.store.set(key, result.data)
                    this.chunkStore.set(key, c)
                } catch (e) {}
            }
        }

        getLogger().info(`NEW: Finish building vector index of project`)
    }

    async query(input: string): Promise<Chunk | undefined> {
        const { pipeline, cos_sim } = await import('@xenova/transformers')
        const pipe = await (this.pipelinePromise ??= pipeline('feature-extraction', this.model))
        try {
            const i = await pipe(input, { pooling: 'mean', normalize: true })
            let best_k = ''
            let best_s = 0
            for (const [k, v] of this.store.entries()) {
                const s = cos_sim(v, i.data)
                if (s > best_s) {
                    best_s = s
                    best_k = k
                }
            }
            return this.chunkStore.get(best_k)
        } catch (e) {}
    }
}
