/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import * as crypto from 'crypto'
import fs from './fs/fs'
import { getLogger } from './logger/logger'
import request from './request'
import { getUserAgent } from './telemetry/util'
import { ToolkitError } from './errors'
import fetch from 'node-fetch'
// TODO remove
// eslint-disable-next-line no-restricted-imports
import { createWriteStream } from 'fs'
import AdmZip from 'adm-zip'

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

export abstract class LSPDownloader {
    constructor(
        private readonly manifestURL: string,
        private readonly supportedLspServerVersions?: string[]
    ) {}

    async fetchManifest() {
        try {
            const resp = await request.fetch('GET', this.manifestURL, {
                headers: {
                    'User-Agent': getUserAgent({ includePlatform: true, includeClientId: true }),
                },
            }).response
            if (!resp.ok) {
                throw new ToolkitError(`Failed to fetch manifest. Error: ${resp.statusText}`)
            }
            return resp.json()
        } catch (e: any) {
            throw new ToolkitError(`Failed to fetch manifest. Error: ${JSON.stringify(e)}`)
        }
    }

    async _download(localFile: string, remoteUrl: string) {
        const res = await fetch(remoteUrl, {
            headers: {
                'User-Agent': getUserAgent({ includePlatform: true, includeClientId: true }),
            },
        })
        if (!res.ok) {
            throw new ToolkitError(`Failed to download. Error: ${JSON.stringify(res)}`)
        }
        return new Promise((resolve, reject) => {
            const file = createWriteStream(localFile)
            res.body.pipe(file)
            res.body.on('error', (err) => {
                reject(err)
            })
            file.on('finish', () => {
                file.close(resolve)
            })
        })
    }

    async getFileSha384(filePath: string): Promise<string> {
        const fileBuffer = await fs.readFileBytes(filePath)
        const hash = crypto.createHash('sha384')
        hash.update(fileBuffer)
        return hash.digest('hex')
    }

    private async hashMatch(filePath: string, content: Content) {
        const sha384 = await this.getFileSha384(filePath)
        if ('sha384:' + sha384 !== content.hashes[0]) {
            getLogger('lsp').error(`Downloaded file sha ${sha384} does not match manifest ${content.hashes[0]}.`)
            await fs.delete(filePath)
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

    getDependency(manifest: Manifest, name: string): Content | undefined {
        if (manifest.isManifestDeprecated) {
            return undefined
        }
        for (const version of manifest.versions) {
            if (version.isDelisted) {
                continue
            }
            if (this.supportedLspServerVersions && !this.supportedLspServerVersions.includes(version.serverVersion)) {
                continue
            }
            for (const t of version.targets) {
                if (
                    (t.platform === process.platform || (t.platform === 'windows' && process.platform === 'win32')) &&
                    t.arch === process.arch
                ) {
                    for (const content of t.contents) {
                        if (content.filename.startsWith(name) && content.hashes.length > 0) {
                            content.serverVersion = version.serverVersion
                            return content
                        }
                    }
                }
            }
        }
        return undefined
    }

    /**
     * Downloads servers.zip, clients.zip, qserver.zip and then extracts them
     */
    async downloadAndExtractServer(server: Content, installLocation: string, name: string, tempFolder: string) {
        const qserverZipTempPath = path.join(tempFolder, `${name}.zip`)
        const downloadOk = await this.downloadAndCheckHash(qserverZipTempPath, server)
        if (!downloadOk) {
            return false
        }

        const zip = new AdmZip(qserverZipTempPath)
        zip.extractAllTo(tempFolder)
        await fs.rename(path.join(tempFolder, name), installLocation)
    }

    /**
     * Install a runtime from the manifest to the runtime location
     */
    async installRuntime(runtime: Content, installLocation: string, tempPath: string) {
        const downloadNodeOk = await this.downloadAndCheckHash(tempPath, runtime)
        if (!downloadNodeOk) {
            return false
        }
        await fs.chmod(tempPath, 0o755)
        await fs.rename(tempPath, installLocation)
    }

    /**
     * Detect if the lsps already exist on the filesystem
     */
    abstract isLspInstalled(): Promise<boolean>

    /**
     * Cleanup any old LSPs or runtimes if they exist
     */
    abstract cleanup(): Promise<boolean>

    /**
     * Given a manifest install any servers and runtimes that are required to disk
     */
    abstract install(manifest: Manifest): Promise<boolean>

    async tryInstallLsp(): Promise<boolean> {
        try {
            if (await this.isLspInstalled()) {
                getLogger('lsp').info(`LSP already installed`)
                return true
            }

            const clean = await this.cleanup()
            if (!clean) {
                getLogger('lsp').error(`Failed to clean up old LSPs`)
                return false
            }

            // fetch download url for server and runtime
            const manifest: Manifest = (await this.fetchManifest()) as Manifest

            return await this.install(manifest)
        } catch (e) {
            getLogger().error(`LspController: Failed to setup LSP server ${e}`)
            return false
        }
    }
}
