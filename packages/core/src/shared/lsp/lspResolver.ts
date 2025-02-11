/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from '../fs/fs'
import { ToolkitError } from '../errors'
import * as semver from 'semver'
import * as path from 'path'
import { FileType } from 'vscode'
import AdmZip from 'adm-zip'
import { TargetContent, logger, LspResult, LspVersion, Manifest } from './types'
import { getApplicationSupportFolder } from '../vscode/env'
import { createHash } from '../crypto'
import { lspSetupStage, StageResolver, tryStageResolvers } from './utils/setupStage'
import { HttpResourceFetcher } from '../resourcefetcher/httpResourceFetcher'
import { showMessageWithCancel } from '../../shared/utilities/messages'
import { Timeout } from '../utilities/timeoutUtils'

export class LanguageServerResolver {
    constructor(
        private readonly manifest: Manifest,
        private readonly lsName: string,
        private readonly versionRange: semver.Range,
        private readonly _defaultDownloadFolder?: string
    ) {}

    /**
     * Downloads and sets up the Language Server, attempting different locations in order:
     * 1. Local cache
     * 2. Remote download
     * 3. Fallback version
     * @throws ToolkitError if no compatible version can be found
     */
    async resolve() {
        const timeout = new Timeout(5000)
        await showMessageWithCancel(`Downloading '${this.lsName}' language server`, timeout)
        function getServerVersion(result: LspResult) {
            return {
                languageServerVersion: result.version,
            }
        }
        try {
            const latestVersion = this.latestCompatibleLspVersion()
            const targetContents = this.getLSPTargetContents(latestVersion)
            const cacheDirectory = this.getDownloadDirectory(latestVersion.serverVersion)

            const serverResolvers: StageResolver<LspResult>[] = [
                {
                    resolve: async () => await this.getLocalServer(cacheDirectory, latestVersion, targetContents),
                    telemetryMetadata: { id: this.lsName, languageServerLocation: 'cache' },
                },
                {
                    resolve: async () => await this.fetchRemoteServer(cacheDirectory, latestVersion, targetContents),
                    telemetryMetadata: { id: this.lsName, languageServerLocation: 'remote' },
                },
                {
                    resolve: async () => await this.getFallbackServer(latestVersion),
                    telemetryMetadata: { id: this.lsName, languageServerLocation: 'fallback' },
                },
            ]

            return await tryStageResolvers('getServer', serverResolvers, getServerVersion)
        } finally {
            logger.info(`Finished setting up LSP server`)
            timeout.cancel()
        }
    }

    private async getFallbackServer(latestVersion: LspVersion): Promise<LspResult> {
        const fallbackDirectory = await this.getFallbackDir(latestVersion.serverVersion)
        if (!fallbackDirectory) {
            throw new ToolkitError('Unable to find a compatible version of the Language Server', {
                code: 'IncompatibleVersion',
            })
        }

        const version = path.basename(fallbackDirectory)
        logger.info(
            `Unable to install ${this.lsName} language server v${latestVersion.serverVersion}. Launching a previous version from ${fallbackDirectory}`
        )

        return {
            location: 'fallback',
            version: version,
            assetDirectory: fallbackDirectory,
        }
    }

    private async fetchRemoteServer(
        cacheDirectory: string,
        latestVersion: LspVersion,
        targetContents: TargetContent[]
    ): Promise<LspResult> {
        if (await this.downloadRemoteTargetContent(targetContents, latestVersion.serverVersion)) {
            return {
                location: 'remote',
                version: latestVersion.serverVersion,
                assetDirectory: cacheDirectory,
            }
        } else {
            throw new ToolkitError('Failed to download server from remote', { code: 'RemoteDownloadFailed' })
        }
    }

    private async getLocalServer(
        cacheDirectory: string,
        latestVersion: LspVersion,
        targetContents: TargetContent[]
    ): Promise<LspResult> {
        if (await this.hasValidLocalCache(cacheDirectory, targetContents)) {
            return {
                location: 'cache',
                version: latestVersion.serverVersion,
                assetDirectory: cacheDirectory,
            }
        } else {
            // Delete the cached directory since it's invalid
            if (await fs.existsDir(cacheDirectory)) {
                await fs.delete(cacheDirectory, {
                    recursive: true,
                })
            }
            throw new ToolkitError('Failed to retrieve server from cache', { code: 'InvalidCache' })
        }
    }

    /**
     * Get all of the compatible language server versions from the manifest
     */
    private compatibleManifestLspVersion() {
        return this.manifest.versions.filter((x) => this.isCompatibleVersion(x))
    }

    /**
     * Returns the path to the most compatible cached LSP version that can serve as a fallback
     **/
    private async getFallbackDir(version: string) {
        const compatibleLspVersions = this.compatibleManifestLspVersion()

        // determine all folders containing lsp versions in the fallback parent folder
        const cachedVersions = (await fs.readdir(this.defaultDownloadFolder()))
            .filter(([_, filetype]) => filetype === FileType.Directory)
            .map(([pathName, _]) => semver.parse(pathName))
            .filter((ver): ver is semver.SemVer => ver !== null)
            .map((x) => x.version)

        const expectedVersion = semver.parse(version)
        if (!expectedVersion) {
            return undefined
        }

        const sortedCachedLspVersions = compatibleLspVersions
            .filter((v) => this.isValidCachedVersion(v, cachedVersions, expectedVersion))
            .sort((a, b) => semver.compare(b.serverVersion, a.serverVersion))

        const fallbackDir = (
            await Promise.all(sortedCachedLspVersions.map((ver) => this.getValidLocalCacheDirectory(ver)))
        ).filter((v) => v !== undefined)
        return fallbackDir.length > 0 ? fallbackDir[0] : undefined
    }

    /**
     * Validate the local cache directory of the given lsp version (matches expected hash)
     * If valid return cache directory, else return undefined
     */
    private async getValidLocalCacheDirectory(version: LspVersion) {
        const targetContents = this.getTargetContents(version)
        if (targetContents === undefined || targetContents.length === 0) {
            return undefined
        }

        const cacheDir = this.getDownloadDirectory(version.serverVersion)
        const hasValidCache = await this.hasValidLocalCache(cacheDir, targetContents)

        return hasValidCache ? cacheDir : undefined
    }

    /**
     * Determines if a cached LSP version is valid for use as a fallback.
     * A version is considered valid if it exists in the cache and is less than
     * or equal to the expected version.
     */
    private isValidCachedVersion(version: LspVersion, cachedVersions: string[], expectedVersion: semver.SemVer) {
        const serverVersion = semver.parse(version.serverVersion) as semver.SemVer
        return cachedVersions.includes(serverVersion.version) && semver.lte(serverVersion, expectedVersion)
    }

    /**
     * Download and unzip all of the contents into the download directory
     *
     * @returns
     *  true, if all of the contents were successfully downloaded and unzipped
     *  false, if any of the contents failed to download or unzip
     */
    private async downloadRemoteTargetContent(contents: TargetContent[], version: string) {
        const downloadDirectory = this.getDownloadDirectory(version)

        if (!(await fs.existsDir(downloadDirectory))) {
            await fs.mkdir(downloadDirectory)
        }

        const fetchTasks = contents.map(async (content) => {
            return {
                res: await new HttpResourceFetcher(content.url, { showUrl: true }).get(),
                hash: content.hashes[0],
                filename: content.filename,
            }
        })
        const fetchResults = await Promise.all(fetchTasks)
        const verifyTasks = fetchResults
            .filter((fetchResult) => fetchResult.res && fetchResult.res.ok && fetchResult.res.body)
            .flatMap(async (fetchResult) => {
                const arrBuffer = await fetchResult.res!.arrayBuffer()
                const data = Buffer.from(arrBuffer)

                const hash = createHash('sha384', data)
                if (hash === fetchResult.hash) {
                    return [{ filename: fetchResult.filename, data }]
                }
                return []
            })
        if (verifyTasks.length !== contents.length) {
            return false
        }

        const filesToDownload = await lspSetupStage('validate', async () => (await Promise.all(verifyTasks)).flat())

        for (const file of filesToDownload) {
            await fs.writeFile(`${downloadDirectory}/${file.filename}`, file.data)
        }

        return this.extractZipFilesFromRemote(downloadDirectory)
    }

    private async extractZipFilesFromRemote(downloadDirectory: string) {
        // Find all the zips
        const zips = (await fs.readdir(downloadDirectory))
            .filter(([fileName, _]) => fileName.endsWith('.zip'))
            .map(([fileName, _]) => `${downloadDirectory}/${fileName}`)

        if (zips.length === 0) {
            return true
        }

        return this.copyZipContents(zips)
    }

    private async hasValidLocalCache(localCacheDirectory: string, targetContents: TargetContent[]) {
        // check if the zips are still at the present location
        const results = await Promise.all(
            targetContents.map((content) => {
                const path = `${localCacheDirectory}/${content.filename}`
                return fs.existsFile(path)
            })
        )

        const allFilesExist = results.every(Boolean)
        return allFilesExist && this.ensureUnzippedFoldersMatchZip(localCacheDirectory, targetContents)
    }

    /**
     * Ensures zip files in cache have an unzipped folder of the same name
     * with the same content files (by name)
     *
     * @returns
     *  false, if any of the unzipped folder don't match zip contents (by name)
     */
    private ensureUnzippedFoldersMatchZip(localCacheDirectory: string, targetContents: TargetContent[]) {
        const zipPaths = targetContents
            .filter((x) => x.filename.endsWith('.zip'))
            .map((y) => `${localCacheDirectory}/${y.filename}`)

        if (zipPaths.length === 0) {
            return true
        }

        return this.copyZipContents(zipPaths)
    }

    /**
     * Copies all the contents from zip into the directory
     *
     * @returns
     *  false, if any of the unzips fails
     */
    private copyZipContents(zips: string[]) {
        const unzips = zips.map((zip) => {
            try {
                // attempt to unzip
                const zipFile = new AdmZip(zip)
                const extractPath = zip.replace('.zip', '')
                zipFile.extractAllTo(extractPath, true)
            } catch (e) {
                return false
            }
            return true
        })

        // make sure every one completed successfully
        return unzips.every(Boolean)
    }

    /**
     * Parses the toolkit lsp version object retrieved from the version manifest to determine
     * lsp contents
     */
    private getLSPTargetContents(version: LspVersion) {
        const lspTarget = this.getCompatibleLspTarget(version)
        if (!lspTarget) {
            throw new ToolkitError("No language server target found matching the system's architecture and platform")
        }

        const targetContents = lspTarget.contents
        if (!targetContents) {
            throw new ToolkitError('No matching target contents found')
        }
        return targetContents
    }

    /**
     * Get the latest language server version matching the toolkit compatible version range,
     * not de-listed and contains the required target contents:
     * architecture, platform and files
     */
    private latestCompatibleLspVersion() {
        if (this.manifest === null) {
            throw new ToolkitError('No valid manifest')
        }

        const latestCompatibleVersion =
            this.manifest.versions
                .filter((ver) => this.isCompatibleVersion(ver) && this.hasRequiredTargetContent(ver))
                .sort((a, b) => semver.compare(b.serverVersion, a.serverVersion))[0] ?? undefined

        if (latestCompatibleVersion === undefined) {
            // TODO fix these error range names
            throw new ToolkitError(
                `Unable to find a language server that satifies one or more of these conditions: version in range [${this.versionRange.range}], matching system's architecture and platform`
            )
        }

        return latestCompatibleVersion
    }

    /**
     * Determine if the given lsp version is toolkit compatible
     * i.e. in version range and not de-listed
     */
    private isCompatibleVersion(version: LspVersion) {
        // invalid version
        if (semver.parse(version.serverVersion) === null) {
            return false
        }

        return (
            semver.satisfies(version.serverVersion, this.versionRange, {
                includePrerelease: true,
            }) && !version.isDelisted
        )
    }

    /**
     * Validates the lsp version contains the required toolkit compatible contents:
     * architecture, platform and file
     */
    private hasRequiredTargetContent(version: LspVersion) {
        const targetContents = this.getTargetContents(version)
        return targetContents !== undefined && targetContents.length > 0
    }

    /**
     * Returns the target contents of the lsp version that contains the required
     * toolkit compatible contents: architecture, platform and file
     */
    private getTargetContents(version: LspVersion) {
        const target = this.getCompatibleLspTarget(version)
        return target?.contents
    }

    /**
     * Retrives the lsp target matching the user's system architecture and platform
     * from the language server version object
     */
    private getCompatibleLspTarget(version: LspVersion) {
        // TODO make this web friendly
        // TODO make this fully support windows

        // Workaround: Manifest platform field is `windows`, whereas node returns win32
        const platform = process.platform === 'win32' ? 'windows' : process.platform
        const arch = process.arch
        return version.targets.find((x) => x.arch === arch && x.platform === platform)
    }

    // lazy calls to `getApplicationSupportFolder()` to avoid failure on windows.
    public static get defaultDir() {
        return path.join(getApplicationSupportFolder(), `aws/toolkits/language-servers`)
    }

    defaultDownloadFolder() {
        return path.join(LanguageServerResolver.defaultDir, `${this.lsName}`)
    }

    private getDownloadDirectory(version: string) {
        const directory = this._defaultDownloadFolder ?? this.defaultDownloadFolder()
        return `${directory}/${version}`
    }
}
