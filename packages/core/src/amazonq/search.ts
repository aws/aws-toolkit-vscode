/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../shared/logger/logger'
import { CurrentWsFolders, collectFiles } from '../shared/utilities/workspaceUtils'

import * as CodeWhispererConstants from '../codewhisperer/models/constants'
import { Chunk } from '../codewhisperer/util/supplementalContext/crossFileContextUtil'
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
    constructor() {}

    async indexFiles(filePaths: string[]) {
        const eid = 'x.encoder'
        if (isExtensionInstalled(eid) && isExtensionActive(eid)) {
            const ext = vscode.extensions.getExtension(eid)
            return ext?.exports.indexFiles(filePaths)
        } else {
            getLogger().info(`NEW: index failed. encode not found`)
        }
    }
    async clear() {
        const eid = 'x.encoder'
        if (isExtensionInstalled(eid) && isExtensionActive(eid)) {
            const ext = vscode.extensions.getExtension(eid)
            return ext?.exports.clear()
        } else {
            getLogger().info(`NEW:  encode not found `)
        }
    }
    async findBest(s: string) {
        const eid = 'x.encoder'
        if (isExtensionInstalled(eid) && isExtensionActive(eid)) {
            const ext = vscode.extensions.getExtension(eid)
            return ext?.exports.findBest(s)
        } else {
            getLogger().info(`NEW:  encode not found `)
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
        this.indexFiles(files.map(f => f.fileUri.fsPath)).then(() => {
            getLogger().info(`NEW: Finish building vector index of project`)
        })
    }

    async query(input: string): Promise<Chunk | undefined> {
        try {
            const c = await this.findBest(input)
            if (c) {
                return {
                    fileName: c.fileName,
                    content: c.content,
                    nextContent: '',
                }
            }
        } catch (e) {
            return undefined
        }
        return undefined
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
