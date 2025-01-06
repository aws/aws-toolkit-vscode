/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import * as crypto from 'crypto'
import fs from './fs/fs'
import { getLogger } from './logger/logger'
import { getUserAgent } from './telemetry/util'
import { ToolkitError } from './errors'
import fetch from 'node-fetch'
// TODO remove
// eslint-disable-next-line no-restricted-imports
import { createWriteStream } from 'fs'
import AdmZip from 'adm-zip'
import { RetryableResourceFetcher } from './resourcefetcher/httpResourceFetcher'
import { Timeout } from './utilities/timeoutUtils'
import globals from './extensionGlobals'

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

export const logger = getLogger('lsp')

interface StorageManifest {
    etag: string
    content: string
}

export abstract class LspDownloader {
    constructor(
        private readonly manifestURL: string,
        protected readonly lsName: string,
        private readonly supportedLspServerVersions?: string[]
    ) {}

    /**
     * Finds the latest available manifest. If it fails to download then fallback to the local
     * manifest version
     */
    async downloadManifest() {
        try {
            const resourceFetcher = new RetryableResourceFetcher({
                resource: this.manifestURL,
                params: {
                    timeout: new Timeout(15000),
                },
            })
            const etag = (globals.globalState.tryGet('aws.toolkit.lsp.manifest', Object) as StorageManifest)?.etag
            const resp = await resourceFetcher.getNewETagContent(etag)
            if (resp.content === undefined) {
                throw new ToolkitError('Content was not downloaded')
            }

            const manifest = JSON.parse(resp.content) as Manifest
            if (manifest.isManifestDeprecated) {
                logger.info('This LSP manifest is deprecated. No future updates will be available.')
            }
            globals.globalState.tryUpdate('aws.toolkit.lsp.manifest', {
                etag: resp.eTag,
                content: resp.content,
            } as StorageManifest)
            return manifest
        } catch (e: any) {
            logger.info('Failed to download latest LSP manifest. Falling back to local manifest.')
            const manifest = globals.globalState.tryGet('aws.toolkit.lsp.manifest', Object)
            if (!manifest) {
                throw new ToolkitError('Failed to download LSP manifest and no local manifest found.')
            }

            if (manifest?.isManifestDeprecated) {
                logger.info('This LSP manifest is deprecated. No future updates will be available.')
            }
            return manifest
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
            logger.error(`Downloaded file sha ${sha384} does not match manifest ${content.hashes[0]}.`)
            await fs.delete(filePath)
            return false
        }
        return true
    }

    async downloadAndCheckHash(filePath: string, content: Content) {
        await this._download(filePath, content.url)
        return await this.hashMatch(filePath, content)
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

    async downloadAndExtractServer({
        content,
        installLocation,
        name,
        tempFolder,
        extractToTempFolder = false,
    }: {
        content: Content
        installLocation: string
        name: string
        tempFolder: string
        extractToTempFolder?: boolean
    }) {
        const serverZipTempPath = path.join(tempFolder, `${name}.zip`)
        const downloadOk = await this.downloadAndCheckHash(serverZipTempPath, content)
        if (!downloadOk) {
            return false
        }

        // load the zip contents
        const extractPath = extractToTempFolder ? tempFolder : path.join(tempFolder, name)
        new AdmZip(serverZipTempPath).extractAllTo(extractPath)

        await fs.rename(path.join(tempFolder, name), installLocation)
    }

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
     * Given a manifest install any servers and runtimes that are required
     */
    abstract install(manifest: Manifest): Promise<boolean>

    /**
     * Get the currently installed version of the LSP on disk
     */
    async latestInstalledVersion(): Promise<string | undefined> {
        const latestVersion: Record<string, string> = globals.globalState.tryGet('aws.toolkit.lsp.versions', Object)
        if (!latestVersion || !latestVersion[this.lsName]) {
            return undefined
        }
        return latestVersion[this.lsName]
    }

    async tryInstallLsp(): Promise<boolean> {
        try {
            if (process.env.AWS_LANGUAGE_SERVER_OVERRIDE) {
                logger.info(`LSP override location: ${process.env.AWS_LANGUAGE_SERVER_OVERRIDE}`)
                return true
            }

            const manifest: Manifest = await this.downloadManifest()

            // if a compatible version was found check what's installed locally
            if (this.latestCompatibleVersion(manifest)) {
                return await this.checkInstalledLS(manifest)
            }

            // we found no latest compatible version in the manifest; try to fallback to a local version
            return this.fallbackToLocalVersion(manifest)
        } catch (err) {
            const e = err as ToolkitError
            logger.info(`Failed to setup LSP server: ${e.message}`)
            return false
        }
    }

    /**
     * Attempts to fall back to a local version if one is available
     */
    async fallbackToLocalVersion(manifest?: Manifest): Promise<boolean> {
        // was language server previously downloaded?
        const installed = await this.isLspInstalled()

        // yes
        if (installed) {
            if (!manifest) {
                // we want to launch if the manifest can't be found
                return true
            }

            // the manifest is found; check that the current version is not delisted
            const currentVersion = await this.latestInstalledVersion()
            const v = manifest.versions.find((v) => v.serverVersion === currentVersion)
            if (v?.isDelisted) {
                throw new ToolkitError('Local LSP version is delisted. Please update to a newer version.')
            }

            // current version is not delisted, we should launch
            return true
        }

        // it was not installed before
        throw new ToolkitError('No compatible local LSP version found', { code: 'LSPNotInstalled' })
    }

    /**
     * Check to see if we can re-use the previously downloaded language server.
     * If it wasn't previously downloaded then download it and store it
     * If it was then check the current installed language version
     *  If there is an error, download the latest version and store it
     *  If there wasn't an error, compare the current and latest versions
     *    If they mismatch then download the latest language server and store it
     *    If they are the same then launch the language server
     */
    async checkInstalledLS(manifest: Manifest): Promise<boolean> {
        // was ls previously downloaded
        const installed = await this.isLspInstalled()

        // yes
        if (installed) {
            try {
                const currentVersion = await this.latestInstalledVersion()
                if (currentVersion !== this.latestCompatibleVersion(manifest)) {
                    // download and install latest version
                    return this._install(manifest)
                }
                return true
            } catch (e) {
                logger.info('Failed to query language server for installed version')

                // error found! download the latest version and store it
                return this._install(manifest)
            }
        }

        // no; install and store it
        return this._install(manifest)
    }

    private _install(manifest: Manifest): Promise<boolean> {
        return this.install(manifest).catch((_) => this.fallbackToLocalVersion(manifest))
    }

    private latestCompatibleVersion(manifest: Manifest) {
        for (const version of manifest.versions) {
            if (version.isDelisted) {
                continue
            }
            if (this.supportedLspServerVersions && !this.supportedLspServerVersions.includes(version.serverVersion)) {
                continue
            }
            return version.serverVersion
        }
        return undefined
    }
}
