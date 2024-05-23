/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs-extra'
import { getLogger } from '../shared/logger/logger'
import { CurrentWsFolders, collectFilesForIndex } from '../shared/utilities/workspaceUtils'
import * as CodeWhispererConstants from '../codewhisperer/models/constants'
import { makeTemporaryToolkitFolder } from '../shared/filesystemUtilities'
import fetch from 'node-fetch'
import { clear, indexFiles, query } from './lsp/lspClient'

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

    async _download(localFile: string, remoteUrl: string) {
        const res = await fetch(remoteUrl, {
            headers: {
                'User-Agent': 'curl/7.68.0',
            },
        })
        if (!res.ok) {
            throw new Error(`Failed to download. Error: ${JSON.stringify(res)}`)
        }
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(localFile)
            res.body.pipe(file)
            res.body.on('error', err => {
                reject(err)
            })
            file.on('finish', () => {
                file.close(resolve)
            })
        })
    }
    async downloadCodeSearch() {
        const fname = `code-search-0.1.18-${process.platform}-${process.arch}.zip`
        const s3Path = `https://github.com/leigaol/code-test-release/${fname}`
        const tempFolder = await makeTemporaryToolkitFolder()
        const localFile = path.join(tempFolder, fname)
        await this._download(localFile, s3Path)
        return localFile
    }

    async installCodeSearch() {}

    async clear() {
        clear('')
    }
    async query(s: string) {
        const c = await query(s)
        if (c) {
            return {
                fileName: c.fileName,
                content: c.content,
                nextContent: '',
            }
        }
    }

    async buildIndex() {
        getLogger().info(`NEW: Starting to build vector index of project`)
        const projPaths = getProjectPaths()
        projPaths.sort()
        if (projPaths.length > 0) {
            const projRoot = projPaths[0]
            const files = await collectFilesForIndex(
                projPaths,
                vscode.workspace.workspaceFolders as CurrentWsFolders,
                true,
                CodeWhispererConstants.projectIndexSizeLimitBytes
            )
            getLogger().info(`NEW: Found ${files.length} files in current project ${getProjectPaths()}`)
            await indexFiles(
                files.map(f => f.fileUri.fsPath),
                projRoot,
                false
            )
            getLogger().info(`NEW: Finish building vector index of project`)
        }
    }
}
