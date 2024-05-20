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
import { Chunk } from '../codewhisperer/util/supplementalContext/crossFileContextUtil'
import { isExtensionInstalled, isExtensionActive } from '../shared/utilities'
import { makeTemporaryToolkitFolder } from '../shared/filesystemUtilities'
import fetch from 'node-fetch'

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

    private extId: string = 'amazonwebservices.code-search'

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
        const fname = `code-search-0.1.10-${process.platform}-${process.arch}.vsix`
        const s3Path = `https://github.com/leigaol/code-test-release/releases/download/0.1.10/${fname}`
        const tempFolder = await makeTemporaryToolkitFolder()
        const localFile = path.join(tempFolder, fname)
        await this._download(localFile, s3Path)
        return localFile
    }

    async installCodeSearch() {
        if (!isExtensionInstalled(this.extId)) {
            try {
                const localFile = await this.downloadCodeSearch()
                await vscode.commands.executeCommand(
                    'workbench.extensions.installExtension',
                    vscode.Uri.file(localFile)
                )
                await fs.removeSync(localFile)
            } catch (e) {
                console.log(e)
            }
        }
    }

    async indexFiles(filePaths: string[], projectRoot: string, refresh: boolean) {
        if (isExtensionInstalled(this.extId) && isExtensionActive(this.extId)) {
            const ext = vscode.extensions.getExtension(this.extId)
            return ext?.exports.indexFiles(filePaths, projectRoot, refresh)
        } else {
            getLogger().info(`NEW: index failed. encode not found`)
        }
    }
    async clear() {
        if (isExtensionInstalled(this.extId) && isExtensionActive(this.extId)) {
            const ext = vscode.extensions.getExtension(this.extId)
            return ext?.exports.clear()
        } else {
            getLogger().info(`NEW:  encode not found `)
        }
    }
    async findBest(s: string) {
        if (isExtensionInstalled(this.extId) && isExtensionActive(this.extId)) {
            const ext = vscode.extensions.getExtension(this.extId)
            return ext?.exports.findBest(s)
        } else {
            getLogger().info(`NEW:  encode not found `)
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
            this.indexFiles(
                files.map(f => f.fileUri.fsPath),
                projRoot,
                false
            ).then(() => {
                getLogger().info(`NEW: Finish building vector index of project`)
            })
        }
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
