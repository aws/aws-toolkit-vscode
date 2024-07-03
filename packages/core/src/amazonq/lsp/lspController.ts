/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs-extra'
import * as crypto from 'crypto'
import { getLogger } from '../../shared/logger/logger'
import { CurrentWsFolders, collectFilesForIndex } from '../../shared/utilities/workspaceUtils'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import fetch from 'node-fetch'
import { LspClient } from './lspClient'
import AdmZip from 'adm-zip'
import { RelevantTextDocument } from '@amzn/codewhisperer-streaming'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { CodeWhispererSettings } from '../../codewhisperer/util/codewhispererSettings'
import { activate as activateLsp } from './lspClient'
import { telemetry } from '../../shared/telemetry'
import { isCloud9 } from '../../shared/extensionUtilities'
import { globals } from '../../shared'
import { AuthUtil } from '../../codewhisperer'
import { isWeb } from '../../shared/extensionGlobals'

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
    readonly programmingLanguage?: string
}

export interface Content {
    filename: string
    url: string
    hashes: string[]
    bytes: number
    serverVersion?: string
}

export interface Target {
    platform: string
    arch: string
    contents: Content[]
}

export interface Manifest {
    manifestSchemaVersion: string
    artifactId: string
    artifactDescription: string
    isManifestDeprecated: boolean
    versions: {
        serverVersion: string
        isDelisted: boolean
        targets: Target[]
    }[]
}
const manifestUrl = 'https://aws-toolkit-language-servers.amazonaws.com/temp/manifest.json'
// this LSP client in Q extension is only going to work with these LSP server versions
const supportedLspServerVersions = ['0.0.6']

const nodeBinName = process.platform === 'win32' ? 'node.exe' : 'node'

export class LspController {
    static #instance: LspController

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

    async downloadManifest() {
        const res = await fetch(manifestUrl, {
            headers: {
                'User-Agent': 'curl/7.68.0',
            },
        })
        if (!res.ok) {
            throw new Error(`Failed to download. Error: ${JSON.stringify(res)}`)
        }
        return res.json()
    }

    async getFileSha384(filePath: string): Promise<string> {
        const fileBuffer = await fs.promises.readFile(filePath)
        const hash = crypto.createHash('sha384')
        hash.update(fileBuffer)
        return hash.digest('hex')
    }

    isLspInstalled(context: vscode.ExtensionContext) {
        const localQServer = context.asAbsolutePath(path.join('resources', 'qserver'))
        const localNodeRuntime = context.asAbsolutePath(path.join('resources', nodeBinName))
        return fs.existsSync(localQServer) && fs.existsSync(localNodeRuntime)
    }

    getQserverFromManifest(manifest: Manifest): Content | undefined {
        if (manifest.isManifestDeprecated) {
            return undefined
        }
        for (const version of manifest.versions) {
            if (version.isDelisted) {
                continue
            }
            if (!supportedLspServerVersions.includes(version.serverVersion)) {
                continue
            }
            for (const t of version.targets) {
                if (
                    (t.platform === process.platform || (t.platform === 'windows' && process.platform === 'win32')) &&
                    t.arch === process.arch
                ) {
                    for (const content of t.contents) {
                        if (content.filename.startsWith('qserver') && content.hashes.length > 0) {
                            content.serverVersion = version.serverVersion
                            return content
                        }
                    }
                }
            }
        }
        return undefined
    }

    getNodeRuntimeFromManifest(manifest: Manifest): Content | undefined {
        if (manifest.isManifestDeprecated) {
            return undefined
        }
        for (const version of manifest.versions) {
            if (version.isDelisted) {
                continue
            }
            if (!supportedLspServerVersions.includes(version.serverVersion)) {
                continue
            }
            for (const t of version.targets) {
                if (
                    (t.platform === process.platform || (t.platform === 'windows' && process.platform === 'win32')) &&
                    t.arch === process.arch
                ) {
                    for (const content of t.contents) {
                        if (content.filename.startsWith('node') && content.hashes.length > 0) {
                            content.serverVersion = version.serverVersion
                            return content
                        }
                    }
                }
            }
        }
        return undefined
    }

    private async hashMatch(filePath: string, content: Content) {
        const sha384 = await this.getFileSha384(filePath)
        if ('sha384:' + sha384 !== content.hashes[0]) {
            getLogger().error(
                `LspController: Downloaded file sha ${sha384} does not match manifest ${content.hashes[0]}.`
            )
            fs.removeSync(filePath)
            return false
        }
        return true
    }

    async downloadAndCheckHash(filePath: string, content: Content) {
        await this._download(filePath, content.url)
        const match = await this.hashMatch(filePath, content)
        if (!match) {
            return false
        }
        return true
    }

    async tryInstallLsp(context: vscode.ExtensionContext): Promise<boolean> {
        try {
            if (this.isLspInstalled(context)) {
                getLogger().info(`LspController: LSP already installed`)
                return true
            }
            const manifest: Manifest = (await this.downloadManifest()) as Manifest
            const qserver = this.getQserverFromManifest(manifest)
            const noderuntime = this.getNodeRuntimeFromManifest(manifest)
            if (!qserver || !noderuntime) {
                getLogger().info(`LspController: Did not find LSP URL for ${process.platform} ${process.arch}`)
                return false
            }

            const tempFolder = await makeTemporaryToolkitFolder()
            const zipFilePath = path.join(tempFolder, 'qserver.zip')
            let downloadOk = await this.downloadAndCheckHash(zipFilePath, qserver)
            if (!downloadOk) {
                return false
            }
            const zip = new AdmZip(zipFilePath)
            zip.extractAllTo(context.asAbsolutePath(path.join('resources')))
            fs.removeSync(zipFilePath)

            const noderuntimeFilePath = path.join(tempFolder, nodeBinName)
            downloadOk = await this.downloadAndCheckHash(noderuntimeFilePath, noderuntime)
            if (!downloadOk) {
                return false
            }
            fs.chmodSync(noderuntimeFilePath, 0o755)
            fs.moveSync(noderuntimeFilePath, context.asAbsolutePath(path.join('resources', nodeBinName)))
            return true
        } catch (e) {
            getLogger().error(`LspController: Failed to setup LSP server ${e}`)
            return false
        }
    }

    async query(s: string): Promise<RelevantTextDocument[]> {
        const chunks: Chunk[] | undefined = await LspClient.instance.query(s)
        const resp: RelevantTextDocument[] = []
        chunks?.forEach(chunk => {
            const text = chunk.context ? chunk.context : chunk.content
            if (chunk.programmingLanguage) {
                resp.push({
                    text: text,
                    relativeFilePath: chunk.relativePath ? chunk.relativePath : path.basename(chunk.filePath),
                    programmingLanguage: {
                        languageName: chunk.programmingLanguage,
                    },
                })
            } else {
                resp.push({
                    text: text,
                    relativeFilePath: chunk.relativePath ? chunk.relativePath : path.basename(chunk.filePath),
                })
            }
        })
        return resp
    }

    async buildIndex() {
        getLogger().info(`LspController: Starting to build vector index of project`)
        const start = performance.now()
        const projPaths = getProjectPaths()
        projPaths.sort()
        try {
            if (projPaths.length === 0) {
                throw Error('No project')
            }
            const projRoot = projPaths[0]
            const files = await collectFilesForIndex(
                projPaths,
                vscode.workspace.workspaceFolders as CurrentWsFolders,
                true,
                CodeWhispererConstants.projectIndexSizeLimitBytes
            )
            let totalSizeBytes = 0
            for (let i = 0; i < files.length; i += 1) {
                totalSizeBytes += files[i].fileSizeBytes
            }
            getLogger().info(`LspController: Found ${files.length} files in current project ${getProjectPaths()}`)
            const resp = await LspClient.instance.indexFiles(
                files.map(f => f.fileUri.fsPath),
                projRoot,
                false
            )
            if (resp) {
                getLogger().debug(`LspController: Finish building vector index of project`)
                const usage = await LspClient.instance.getLspServerUsage()
                telemetry.amazonq_indexWorkspace.emit({
                    duration: performance.now() - start,
                    result: 'Succeeded',
                    amazonqIndexFileCount: files.length,
                    amazonqIndexMemoryUsageInMB: usage ? usage.memoryUsage / (1024 * 1024) : undefined,
                    amazonqIndexCpuUsagePercentage: usage ? usage.cpuUsage : undefined,
                    amazonqIndexFileSizeInMB: totalSizeBytes / (1024 * 1024),
                    credentialStartUrl: AuthUtil.instance.startUrl,
                })
            } else {
                getLogger().error(`LspController: Failed to build vector index of project`)
                telemetry.amazonq_indexWorkspace.emit({
                    duration: performance.now() - start,
                    result: 'Failed',
                    amazonqIndexFileCount: 0,
                    amazonqIndexFileSizeInMB: 0,
                })
            }
        } catch (e) {
            getLogger().error(`LspController: Failed to build vector index of project`)
            telemetry.amazonq_indexWorkspace.emit({
                duration: performance.now() - start,
                result: 'Failed',
                amazonqIndexFileCount: 0,
                amazonqIndexFileSizeInMB: 0,
            })
        }
    }

    async trySetupLsp(context: vscode.ExtensionContext) {
        if (isCloud9() || isWeb()) {
            // do not do anything if in Cloud9 or Web mode.
            return
        }
        setImmediate(async () => {
            if (!CodeWhispererSettings.instance.isLocalIndexEnabled()) {
                // only download LSP for users who did not turn on this feature
                // do not start LSP server
                await LspController.instance.tryInstallLsp(context)
                return
            }
            const ok = await LspController.instance.tryInstallLsp(context)
            if (!ok) {
                return
            }
            try {
                await activateLsp(context)
                getLogger().info('LspController: LSP activated')
                LspController.instance.buildIndex()

                globals.clock.setInterval(
                    async () => {
                        const usage = await LspClient.instance.getLspServerUsage()
                        if (usage) {
                            getLogger().info(
                                `LspController: LSP server CPU ${usage.cpuUsage}%, LSP server Memory ${
                                    usage.memoryUsage / (1024 * 1024)
                                }MB  `
                            )
                        }
                    },
                    20 * 60 * 1000
                )
            } catch (e) {
                getLogger().error(`LspController: LSP failed to activate ${e}`)
            }
        })
    }
}
