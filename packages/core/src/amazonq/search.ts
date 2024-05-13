/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../shared/logger/logger'
import { CurrentWsFolders, collectFiles } from '../shared/utilities/workspaceUtils'

import * as CodeWhispererConstants from '../codewhisperer/models/constants'
import { Chunk, splitFileToChunks } from '../codewhisperer/util/supplementalContext/crossFileContextUtil'
import { isExtensionInstalled, isExtensionActive } from '../shared/utilities'

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
        this.store = new Map<string, number[]>()
        this.chunkStore = new Map<string, Chunk>()
    }

    task = 'feature-extraction'
    model = 'Xenova/sentence_bert'

    private store: Map<string, number[]>
    private chunkStore: Map<string, Chunk>

    async encode(s: string) {
        const eid = 'x.encoder'
        if (isExtensionInstalled(eid) && isExtensionActive(eid)) {
            const ext = vscode.extensions.getExtension(eid)
            return ext?.exports.encode(s)
        } else {
            getLogger().info(`NEW: get encoder `)
        }
    }

    async buildIndex() {
        getLogger().info(`NEW: Starting to build vector index of project`)
        const files = await collectFiles(
            getProjectPaths(),
            vscode.workspace.workspaceFolders as CurrentWsFolders,
            true,
            CodeWhispererConstants.projectScanPayloadSizeLimitBytes
        )

        getLogger().info(`NEW: Found ${files.length} files in current project ${getProjectPaths()}`)
        for (const file of files) {
            const chunks = await splitFileToChunks(file.fileUri.fsPath, 50)
            for (const c of chunks) {
                try {
                    const result = await this.encode(c.content)
                    const key = c.fileName + '|' + c.index
                    this.store.set(key, result[0] as number[])
                    this.chunkStore.set(key, c)
                } catch (e) {}
            }
        }

        getLogger().info(`NEW: Finish building vector index of project`)
    }

    prevK(k: string) {
        const i = Number(k.split('|')[0])
        const f = k.split('|')[1]
        return `${f}|${i - 1}`
    }
    nextK(k: string) {
        const i = Number(k.split('|')[0])
        const f = k.split('|')[1]
        return `${f}|${i + 1}`
    }

    async query(input: string): Promise<Chunk | undefined> {
        try {
            const i = await this.encode(input)
            let best_k = ''
            let best_s = 0
            for (const [k, v] of this.store.entries()) {
                const s = cos_sim(v, i[0])
                if (s > best_s) {
                    best_s = s
                    best_k = k
                }
            }

            const pk = this.prevK(best_k)
            const ps = this.chunkStore.get(pk)
            const nk = this.nextK(best_k)
            const ns = this.chunkStore.get(nk)
            let rcode = ''
            if (ps) {
                rcode += ps.content
            }
            rcode += this.chunkStore.get(best_k)?.content
            if (ns) {
                rcode += ns.content
            }
            getLogger().info(`Found relevant code ${rcode}`)
            const r = this.chunkStore.get(best_k)
            if (r) {
                r.content = rcode
                return r
            }
            return r
        } catch (e) {}
    }
}

/**
 * Calculates the dot product of two arrays.
 * @param {number[]} arr1 The first array.
 * @param {number[]} arr2 The second array.
 * @returns {number} The dot product of arr1 and arr2.
 */
export function dot(arr1: number[], arr2: number[]) {
    let result = 0
    for (let i = 0; i < arr1.length; ++i) {
        result += arr1[i] * arr2[i]
    }
    return result
}

/**
 * Calculates the magnitude of a given array.
 * @param {number[]} arr The array to calculate the magnitude of.
 * @returns {number} The magnitude of the array.
 */
export function magnitude(arr: number[]) {
    return Math.sqrt(arr.reduce((acc, val) => acc + val * val, 0))
}

/**
 * Computes the cosine similarity between two arrays.
 *
 * @param {number[]} arr1 The first array.
 * @param {number[]} arr2 The second array.
 * @returns {number} The cosine similarity between the two arrays.
 */
export function cos_sim(arr1: number[], arr2: number[]) {
    // Calculate dot product of the two arrays
    const dotProduct = dot(arr1, arr2)

    // Calculate the magnitude of the first array
    const magnitudeA = magnitude(arr1)

    // Calculate the magnitude of the second array
    const magnitudeB = magnitude(arr2)

    // Calculate the cosine similarity
    const cosineSimilarity = dotProduct / (magnitudeA * magnitudeB)

    return cosineSimilarity
}
