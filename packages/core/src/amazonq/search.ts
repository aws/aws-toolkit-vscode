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
import fetch from 'node-fetch'
import { clear, indexFiles, query } from './lsp/lspClient'
import { SystemUtilities } from '../shared/systemUtilities'
import AdmZip from 'adm-zip'
import { RelevantTextDocument } from '@amzn/codewhisperer-streaming'

function getProjectPaths() {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw Error('No workspace folders found')
    }
    return workspaceFolders.map(folder => folder.uri.fsPath)
}

export interface Chunk {
    readonly filePath: string
    readonly content: string
    readonly context?: string
    readonly relativePath?: string
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

    isLspInstalled() {
        const extPath = path.join(SystemUtilities.getHomeDirectory(), '.vscode', 'extensions')
        const localQServer = path.join(extPath, 'qserver')
        return fs.existsSync(localQServer)
    }

    async installLspZipIfNotInstalled(context: vscode.ExtensionContext) {
        const localQServer = context.asAbsolutePath(path.join('resources', 'qserver'))
        const zipFilePath = context.asAbsolutePath(path.join('resources', 'qserver.zip'))
        if (!fs.existsSync(localQServer)) {
            const zip = new AdmZip(zipFilePath)
            zip.extractAllTo(context.asAbsolutePath(path.join('resources')))
        }
    }

    async installLspZip() {
        const extPath = path.join(SystemUtilities.getHomeDirectory(), '.vscode', 'extensions')
        const localQServer = path.join(extPath, 'qserver')
        if (fs.existsSync(localQServer)) {
            getLogger().info(`Found qserver at ${localQServer}`)
            return localQServer
        }

        try {
            const fname = `qserver-${process.platform}-${process.arch}.zip`
            const s3Path = `https://github.com/leigaol/test-qserver/releases/download/0.1/${fname}`
            // use aws api, aws credentials, allow
            const localFile = path.join(SystemUtilities.getHomeDirectory(), '.vscode', 'extensions', fname)
            if (fs.existsSync(localFile)) {
                getLogger().info(`Found qserver.zip at ${localFile}`)
                return localFile
            }
            await this._download(localFile, s3Path)
            const zip = new AdmZip(localFile)
            zip.extractAllTo(extPath)
            return localFile
        } catch (e) {
            getLogger().error(`Failed to download qserver: ${e}`)
        }
    }

    async clear() {
        clear('')
    }

    filenameToPl(filePath: string) {
        // (python|javascript|java|csharp|typescript|c|cpp|go|kotlin|php|ruby|rust|scala|shell|sql|json|yaml|vue|tf|tsx|jsx|plaintext)
        const extName = path.basename(filePath).split('.').pop()?.toLocaleLowerCase()
        let pl = ''
        if (!extName) {
            pl = 'plaintext'
        }
        switch (extName) {
            case 'js':
            case 'mjs':
                return 'javascript'
            case 'ts':
            case 'mts':
                return 'typescript'
            case 'c':
                return 'c'
            case 'cpp':
            case 'c++':
                return 'cpp'
            case 'py':
                return 'python'
            case 'java':
                return 'java'
            case 'cs':
                return 'csharp'
            case 'go':
                return 'go'
            case 'kt':
                return 'kotlin'
            case 'php':
                return 'php'
            case 'rb':
                return 'ruby'
            case 'rs':
                return 'rust'
            case 'scala':
                return 'scala'
            case 'sh':
                return 'shell'
            case 'tf':
                return 'tf'
            case 'json':
                return 'json'
            default:
                return 'plaintext'
        }
        return pl
    }

    async query(s: string): Promise<RelevantTextDocument[]> {
        const cs: Chunk[] = await query(s)
        const resp: RelevantTextDocument[] = []
        cs.forEach(chunk => {
            const text = chunk.context ? chunk.context : chunk.content
            resp.push({
                text: text,
                relativeFilePath: chunk.relativePath ? chunk.relativePath : path.basename(chunk.filePath),
                programmingLanguage: {
                    languageName: this.filenameToPl(chunk.filePath),
                },
            })
        })
        return resp
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

    async updateIndex(filepath: string) {}
}
