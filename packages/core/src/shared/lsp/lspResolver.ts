/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from '../fs/fs'
import { ToolkitError } from '../errors'
import * as semver from 'semver'
import * as path from 'path'
import * as crypto from 'crypto'
import { FileType } from 'vscode'
import AdmZip from 'adm-zip'
import { TargetContent, logger, LspResult, LspVersion, Manifest } from './types'
import { createHash } from '../crypto'
import { lspSetupStage, StageResolver, tryStageResolvers } from './utils/setupStage'
import { showProgressWithTimeout } from '../../shared/utilities/messages'
import { Timeout } from '../utilities/timeoutUtils'
import { oneMinute } from '../datetime'
import vscode from 'vscode'
import { TargetPlatformResolver, defaultTargetPlatformResolver, findCompatibleTarget } from './utils/targetResolver'

// max timeout for downloading remote LSP assets. Some assets are large (100+ MB) so this needs to be large for slow connections.
// Since the user can cancel this one we can let it run very long.
const remoteDownloadTimeout = oneMinute * 30

/**
 * Number of outer retry attempts for bundle download.
 */
const downloadMaxRetries = 3

/**
 * Base delay in milliseconds for exponential backoff between download attempts.
 */
const downloadBaseDelayMs = 2000

/** Verifies an optional file list relative to the install root or its extracted bundle directory. */
export async function verifyRequiredFiles(directory: string, requiredFiles: readonly string[]): Promise<void> {
    if (requiredFiles.length === 0) {
        return
    }

    const missing: string[] = []
    for (const requiredFile of requiredFiles) {
        const filePath = path.join(directory, requiredFile)
        const exists = (await fs.existsFile(filePath)) || (await fs.existsDir(filePath))
        if (!exists && !(await findFileInSubdirs(directory, requiredFile))) {
            missing.push(requiredFile)
        }
    }

    if (missing.length > 0) {
        throw new ToolkitError(`Required files missing after install: ${missing.join(', ')}`, {
            code: 'MissingRequiredFiles',
        })
    }
}

async function findFileInSubdirs(baseDir: string, filename: string): Promise<boolean> {
    const entries = await fs.readdir(baseDir)
    for (const [name, type] of entries) {
        if (type === FileType.Directory) {
            const candidate = path.join(baseDir, name, filename)
            if ((await fs.existsFile(candidate)) || (await fs.existsDir(candidate))) {
                return true
            }
        }
    }
    return false
}

export interface LspResolverConfig {
    /** Display name of the language server. */
    lsName: string
    /** Semver range for compatible versions. */
    versionRange: semver.Range
    /** URL for progress/error messages. */
    manifestUrl: string
    /** Optional custom download message. */
    downloadMessage?: string
    /** Hash algorithm for integrity verification when only raw digest is provided. Default: 'sha384'. */
    hashAlgorithm?: string
    /**
     * Base filesystem directory for this language server's downloads.
     * Default: `<platformCacheDir>/aws/toolkits/language-servers/<lsName>`
     */
    baseDir?: string
    /**
     * Optional files that must exist for cache/publication integrity and are verified again after postInstall.
     */
    requiredFiles?: string[]
    /**
     * Custom target platform resolver. If not provided, uses default which returns
     * process.platform (e.g. `win32`) and detects legacy Linux -> `linuxglib2.28`.
     */
    targetPlatformResolver?: TargetPlatformResolver
    /**
     * Injectable fetch function for testing. Defaults to HttpResourceFetcher.
     */
    fetchFn?: (url: string, timeout: Timeout) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>
    /**
     * Injectable sleep function for testing. Defaults to setTimeout-based delay.
     */
    sleepFn?: (ms: number) => Promise<void>
}

export class LanguageServerResolver {
    private readonly downloadMessage: string
    private readonly hashAlgorithm: string
    private readonly baseDir: string
    private readonly requiredFiles: string[]
    private readonly targetPlatformResolver: TargetPlatformResolver
    private readonly fetchFn?: LspResolverConfig['fetchFn']
    private readonly sleepFn: (ms: number) => Promise<void>

    constructor(
        private readonly manifest: Manifest,
        private readonly lsName: string,
        private readonly versionRange: semver.Range,
        private readonly manifestUrl: string,
        /**
         * Custom message to show user when downloading, if undefined it will use the default.
         */
        downloadMessage?: string,
        hashAlgorithm?: string,
        baseDir?: string,
        requiredFiles?: string[],
        targetPlatformResolver?: TargetPlatformResolver,
        fetchFn?: LspResolverConfig['fetchFn'],
        sleepFn?: (ms: number) => Promise<void>
    ) {
        this.downloadMessage = downloadMessage ?? `Updating '${this.lsName}' language server`
        this.hashAlgorithm = hashAlgorithm ?? 'sha384'
        this.baseDir = baseDir ?? path.join(fs.getCacheDir(), 'aws', 'toolkits', 'language-servers', this.lsName)
        this.requiredFiles = requiredFiles ?? []
        this.targetPlatformResolver = targetPlatformResolver ?? defaultTargetPlatformResolver
        this.fetchFn = fetchFn
        this.sleepFn = sleepFn ?? defaultSleep
    }

    /**
     * Construct from a config object (preferred for new code).
     */
    static fromConfig(manifest: Manifest, config: LspResolverConfig): LanguageServerResolver {
        return new LanguageServerResolver(
            manifest,
            config.lsName,
            config.versionRange,
            config.manifestUrl,
            config.downloadMessage,
            config.hashAlgorithm,
            config.baseDir,
            config.requiredFiles,
            config.targetPlatformResolver,
            config.fetchFn,
            config.sleepFn
        )
    }

    /**
     * Downloads and sets up the Language Server, attempting different locations in order:
     * 1. Local cache
     * 2. Remote download (with 3 outer retries and exponential backoff)
     * 3. Fallback version
     * @throws ToolkitError if no compatible version can be found
     */
    async resolve() {
        function getServerVersion(result: LspResult) {
            return {
                languageServerVersion: result.version,
            }
        }
        const latestVersion = this.latestCompatibleLspVersion()
        const targetContents = this.getLSPTargetContents(latestVersion)
        const cacheDirectory = this.getDownloadDirectory(latestVersion.serverVersion)

        const serverResolvers: StageResolver<LspResult>[] = [
            {
                // 1: Use the current local ("cached") LSP server bundle, if any.
                resolve: async () => await this.getLocalServer(cacheDirectory, latestVersion, targetContents),
                telemetryMetadata: { id: this.lsName, languageServerLocation: 'cache' },
            },
            {
                // 2: Download the latest LSP server bundle with retries.
                resolve: async () => await this.fetchRemoteServer(cacheDirectory, latestVersion, targetContents),
                telemetryMetadata: { id: this.lsName, languageServerLocation: 'remote' },
            },
            {
                // 3: If the download fails, try an older, cached version.
                resolve: async () => await this.getFallbackServer(latestVersion),
                telemetryMetadata: { id: this.lsName, languageServerLocation: 'fallback' },
            },
        ]

        const resolved = await tryStageResolvers('getServer', serverResolvers, getServerVersion)
        logger.info('Finished preparing "%s" LSP server: %O', this.lsName, resolved.assetDirectory)
        return resolved
    }

    /** Finds an older, cached version of the LSP server bundle. */
    private async getFallbackServer(latestVersion: LspVersion): Promise<LspResult> {
        const cachedVersions = await this.getCachedVersions()
        if (cachedVersions.length === 0) {
            throw new ToolkitError(
                `Unable to download dependencies from ${this.manifestUrl}. Check your network connectivity or firewall configuration and then try again.`,
                {
                    code: 'NetworkConnectivityError',
                }
            )
        }

        const fallbackDirectory = await this.getFallbackDir(latestVersion.serverVersion, cachedVersions)
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

    /**
     * Show a toast notification with progress bar for lsp remote download.
     * Returns a timeout to be passed down into httpFetcher to handle user cancellation.
     */
    private async showDownloadProgress() {
        const timeout = new Timeout(remoteDownloadTimeout)
        void showProgressWithTimeout(
            {
                title: this.downloadMessage,
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
            },
            timeout,
            0
        )
        return timeout
    }

    /**
     * Downloads the latest LSP server bundle with exactly 3 outer attempts
     * and exponential backoff. Each attempt performs atomic install.
     */
    private async fetchRemoteServer(
        cacheDirectory: string,
        latestVersion: LspVersion,
        targetContents: TargetContent[]
    ): Promise<LspResult> {
        let lastError: Error | undefined

        for (let attempt = 1; attempt <= downloadMaxRetries; attempt++) {
            const timeout = await this.showDownloadProgress()
            try {
                const success = await this.downloadRemoteTargetContent(targetContents, latestVersion, timeout)
                if (success) {
                    return {
                        location: 'remote',
                        version: latestVersion.serverVersion,
                        assetDirectory: cacheDirectory,
                    }
                }
                lastError = new Error('Download verification failed')
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err))
                logger.warn(
                    `Download attempt ${attempt}/${downloadMaxRetries} failed for "${this.lsName}": ${lastError.message}`
                )
            } finally {
                timeout.dispose()
            }

            if (attempt < downloadMaxRetries) {
                const delay = downloadBaseDelayMs * Math.pow(2, attempt - 1)
                await this.sleepFn(delay)
            }
        }

        throw new ToolkitError(
            `Failed to download "${this.lsName}" server after ${downloadMaxRetries} attempts: ${lastError?.message}`,
            { code: 'RemoteDownloadFailed', cause: lastError }
        )
    }

    /** Gets the current local ("cached") LSP server bundle. */
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
                await fs.delete(cacheDirectory, { force: true, recursive: true })
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
    private async getFallbackDir(version: string, cachedVersions: string[]) {
        const compatibleLspVersions = this.compatibleManifestLspVersion()

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

    private async getCachedVersions() {
        if (!(await fs.existsDir(this.baseDir))) {
            return []
        }
        return (await fs.readdir(this.baseDir))
            .filter(([_, filetype]) => filetype === FileType.Directory)
            .map(([pathName, _]) => semver.parse(pathName))
            .filter((ver): ver is semver.SemVer => ver !== null)
            .map((x) => x.version)
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
     */
    private isValidCachedVersion(version: LspVersion, cachedVersions: string[], expectedVersion: semver.SemVer) {
        const serverVersion = semver.parse(version.serverVersion) as semver.SemVer
        return cachedVersions.includes(serverVersion.version) && semver.lte(serverVersion, expectedVersion)
    }

    /**
     * Download and unzip all of the contents into the download directory.
     * Installs atomically: downloads to a unique PID/random temp dir, validates required files
     * BEFORE the final rename, deletes zip files, then renames to final location.
     * Never deletes a valid final install before the rename succeeds.
     * If another process wins the race, validates the winner's install.
     */
    private async downloadRemoteTargetContent(contents: TargetContent[], lspVersion: LspVersion, timeout: Timeout) {
        const downloadDirectory = this.getDownloadDirectory(lspVersion.serverVersion)
        const randomSuffix = crypto.randomBytes(8).toString('hex')
        const tempDirectory = `${downloadDirectory}.${process.pid}-${randomSuffix}`

        // Clean up any leftover temp from a previous crash with same PID (unlikely but safe)
        if (await fs.existsDir(tempDirectory)) {
            await fs.delete(tempDirectory, { force: true, recursive: true })
        }
        await fs.mkdir(tempDirectory)

        try {
            const fetchTasks = contents.map(async (content) => {
                const res = await this.doFetch(content.url, timeout)
                return { res, hashes: content.hashes, filename: content.filename }
            })
            const fetchResults = await Promise.all(fetchTasks)

            const verifyTasks = fetchResults
                .filter((fetchResult) => fetchResult.res && fetchResult.res.ok)
                .map(async (fetchResult) => {
                    const arrBuffer = await fetchResult.res!.arrayBuffer()
                    const data = Buffer.from(arrBuffer)

                    // Skip hash verification if no hashes provided
                    if (!fetchResult.hashes || fetchResult.hashes.length === 0) {
                        return { filename: fetchResult.filename, data }
                    }

                    // Verify hash - any valid matching hash passes
                    if (this.verifyHash(data, fetchResult.hashes)) {
                        return { filename: fetchResult.filename, data }
                    }

                    logger.error('Invalid hash for %s', fetchResult.filename)
                    return undefined
                })

            const verified = (await Promise.all(verifyTasks)).filter(
                (r): r is { filename: string; data: Buffer } => r !== undefined
            )
            if (verified.length !== contents.length) {
                return false
            }

            const filesToDownload = await lspSetupStage('validate', async () => verified)

            // We were instructed by legal to show this message
            const thirdPartyLicenses = lspVersion.thirdPartyLicenses
            logger.info(
                `Installing '${this.lsName}' Language Server v${lspVersion.serverVersion} to: ${downloadDirectory}${thirdPartyLicenses ? ` (Attribution notice can be found at ${thirdPartyLicenses})` : ''}`
            )

            for (const file of filesToDownload) {
                await fs.writeFile(`${tempDirectory}/${file.filename}`, file.data)
            }

            const extractionOk = await this.extractZipFilesFromRemote(tempDirectory)
            if (!extractionOk) {
                await fs.delete(tempDirectory, { force: true, recursive: true })
                return false
            }

            // Delete zip files after successful extraction
            await this.deleteZipFiles(tempDirectory)

            // Validate required files BEFORE final rename
            if (this.requiredFiles.length > 0) {
                await this.validateRequiredFiles(tempDirectory)
            }

            // Atomic rename: move temp dir to final location
            // NEVER delete a valid final install before rename succeeds
            if (await fs.existsDir(downloadDirectory)) {
                // Another process won the race — validate the winner
                if (await this.validateWinnerInstall(downloadDirectory)) {
                    // Winner's install is valid; clean up our temp and use the winner
                    await fs.delete(tempDirectory, { force: true, recursive: true })
                    return true
                }
                // Winner's install is invalid; remove it and proceed with our install
                await fs.delete(downloadDirectory, { force: true, recursive: true })
            }

            try {
                await fs.rename(tempDirectory, downloadDirectory)
            } catch (renameErr) {
                // Race condition: another process renamed at the same instant
                if (await fs.existsDir(downloadDirectory)) {
                    if (await this.validateWinnerInstall(downloadDirectory)) {
                        await fs.delete(tempDirectory, { force: true, recursive: true })
                        return true
                    }
                }
                throw renameErr
            }

            return true
        } catch (err) {
            // Clean up temp dir on failure
            if (await fs.existsDir(tempDirectory)) {
                await fs.delete(tempDirectory, { force: true, recursive: true })
            }
            throw err
        }
    }

    /**
     * Verifies hash for downloaded content.
     * Supports hashes in `algorithm:digest` format (e.g. "sha256:abc123")
     * and legacy raw hex digest (uses configured algorithm).
     *
     * Semantics:
     * - No hashes, or no parseable/supported hash entries → skip verification (return true).
     * - At least one supported hash was computed → at least one must match (case-insensitive).
     */
    private verifyHash(data: Buffer, hashes: string[]): boolean {
        let computedAny = false

        for (const hashEntry of hashes) {
            if (!hashEntry) {
                continue
            }

            let algorithm: string
            let expectedDigest: string

            if (hashEntry.includes(':')) {
                // Parse algorithm:digest format
                const colonIdx = hashEntry.indexOf(':')
                algorithm = hashEntry.substring(0, colonIdx).toLowerCase()
                expectedDigest = hashEntry.substring(colonIdx + 1)
            } else {
                // Legacy raw hex digest — use configured algorithm
                algorithm = this.hashAlgorithm
                expectedDigest = hashEntry
            }

            try {
                // createHash returns "algorithm:hex" — extract just the hex portion
                const fullHash = createHash(algorithm, data)
                const colonPos = fullHash.indexOf(':')
                const actualDigest = colonPos >= 0 ? fullHash.substring(colonPos + 1) : fullHash
                computedAny = true

                if (actualDigest.toLowerCase() === expectedDigest.toLowerCase()) {
                    return true
                }
            } catch {
                // Invalid/unsupported algorithm; skip this hash entry
                logger.warn(`Unsupported hash algorithm "${algorithm}", skipping`)
            }
        }

        // If we never successfully computed any hash (all unsupported or empty), skip verification
        return !computedAny
    }

    /** Validates that a race winner's install directory has required files. */
    private async validateWinnerInstall(directory: string): Promise<boolean> {
        if (this.requiredFiles.length === 0) {
            return true
        }
        try {
            await this.validateRequiredFiles(directory)
            return true
        } catch {
            return false
        }
    }

    /** Remove zip files after successful extraction. */
    private async deleteZipFiles(directory: string) {
        const entries = await fs.readdir(directory)
        for (const [fileName] of entries) {
            if (fileName.endsWith('.zip')) {
                await fs.delete(path.join(directory, fileName))
            }
        }
    }

    /** Validate that all configured files exist in the install directory. */
    private async validateRequiredFiles(directory: string): Promise<void> {
        await verifyRequiredFiles(directory, this.requiredFiles)
    }

    private async extractZipFilesFromRemote(downloadDirectory: string) {
        const zips = (await fs.readdir(downloadDirectory))
            .filter(([fileName, _]) => fileName.endsWith('.zip'))
            .map(([fileName, _]) => `${downloadDirectory}/${fileName}`)

        if (zips.length === 0) {
            return true
        }

        return this.copyZipContents(zips, downloadDirectory)
    }
    /** Validates an installed version against the current manifest target and configured required files. */
    async isValidCacheDirectory(localCacheDirectory: string): Promise<boolean> {
        const directoryVersion = semver.parse(path.basename(localCacheDirectory))
        if (!directoryVersion) {
            return false
        }

        const manifestVersion = this.compatibleManifestLspVersion().find((version) => {
            const parsedVersion = semver.parse(version.serverVersion)
            return parsedVersion?.compare(directoryVersion) === 0
        })
        if (!manifestVersion) {
            return false
        }

        const targetContents = this.getTargetContents(manifestVersion)
        return targetContents !== undefined && this.hasValidLocalCache(localCacheDirectory, targetContents)
    }

    private async hasValidLocalCache(localCacheDirectory: string, targetContents: TargetContent[]) {
        if (!(await fs.existsDir(localCacheDirectory))) {
            return false
        }

        // Validate required files if configured
        if (this.requiredFiles.length > 0) {
            try {
                await this.validateRequiredFiles(localCacheDirectory)
            } catch {
                return false
            }
            return true
        }

        // For non-zip content, check the files are present
        const nonZipContents = targetContents.filter((c) => !c.filename.endsWith('.zip'))
        for (const content of nonZipContents) {
            const filePath = `${localCacheDirectory}/${content.filename}`
            if (!(await fs.existsFile(filePath))) {
                return false
            }
        }

        // For zip contents, verify extracted folders exist
        return this.ensureUnzippedFoldersMatchZip(localCacheDirectory, targetContents)
    }

    /**
     * Ensures zip files in cache have an unzipped folder of the same name
     * with the same content files (by name)
     */
    private ensureUnzippedFoldersMatchZip(localCacheDirectory: string, targetContents: TargetContent[]) {
        const zipPaths = targetContents
            .filter((x) => x.filename.endsWith('.zip'))
            .map((y) => `${localCacheDirectory}/${y.filename}`)

        if (zipPaths.length === 0) {
            return true
        }

        // Check if extracted directories exist (zip files may have been deleted)
        for (const zipPath of zipPaths) {
            const extractPath = zipPath.replace('.zip', '')
            try {
                const zipExists = require('fs').existsSync(zipPath) // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports
                const dirExists = require('fs').existsSync(extractPath) // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

                if (!zipExists && !dirExists) {
                    return false
                }
                if (zipExists && !dirExists) {
                    // Need to re-extract
                    return this.copyZipContents([zipPath], localCacheDirectory)
                }
            } catch {
                return false
            }
        }
        return true
    }

    /**
     * Extracts zip contents with zip-slip/path traversal preflight.
     * Validates all entries before extraction to ensure no paths escape the target directory.
     */
    private copyZipContents(zips: string[], _baseDirectory: string) {
        const unzips = zips.map((zip) => {
            try {
                const zipFile = new AdmZip(zip)
                const extractPath = zip.replace('.zip', '')
                const resolvedExtractPath = path.resolve(extractPath)

                // Preflight: check all entries for zip-slip/path traversal
                const entries = zipFile.getEntries()
                for (const entry of entries) {
                    const entryPath = path.resolve(resolvedExtractPath, entry.entryName)
                    if (!entryPath.startsWith(resolvedExtractPath + path.sep) && entryPath !== resolvedExtractPath) {
                        logger.error(
                            `Zip-slip detected in "${zip}": entry "${entry.entryName}" would extract outside target directory`
                        )
                        return false
                    }
                }

                /**
                 * Avoid overwriting existing files during extraction to prevent file corruption.
                 * On Mac ARM64 when a language server is already running in one VS Code window,
                 * attempting to extract and overwrite its files from another window can cause
                 * the newly started language server to crash with 'EXC_CRASH (SIGKILL (Code Signature Invalid))'.
                 */
                zipFile.extractAllTo(extractPath, false)
            } catch (e) {
                logger.error(`Failed to extract zip: ${e}`)
                return false
            }
            return true
        })

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
     * not de-listed and contains the required target contents.
     * Always picks the highest semver version — never prefers an older version with a `latest` flag.
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
            throw new ToolkitError(
                `Unable to find a language server that satisfies one or more of these conditions: version in range [${this.versionRange.range}], matching system's architecture and platform`
            )
        }

        return latestCompatibleVersion
    }

    /**
     * Determine if the given lsp version is toolkit compatible
     */
    private isCompatibleVersion(version: LspVersion) {
        if (semver.parse(version.serverVersion) === null) {
            return false
        }

        return (
            semver.satisfies(version.serverVersion, this.versionRange, {
                includePrerelease: true,
            }) && !version.isDelisted
        )
    }

    private hasRequiredTargetContent(version: LspVersion) {
        const targetContents = this.getTargetContents(version)
        return targetContents !== undefined && targetContents.length > 0
    }

    private getTargetContents(version: LspVersion) {
        const target = this.getCompatibleLspTarget(version)
        return target?.contents
    }

    /**
     * Gets the compatible target using the configured target platform resolver.
     * Uses process.platform directly (e.g. `win32`) — NOT the legacy `windows` mapping.
     */
    private getCompatibleLspTarget(version: LspVersion) {
        const targetPlatform = this.targetPlatformResolver()
        return findCompatibleTarget(version, targetPlatform)
    }

    /**
     * Gets platform-specific "cache" dir ("$LOCALAPPDATA/aws/…" or "~/.cache/aws/…").
     */
    public static defaultDir() {
        return path.join(fs.getCacheDir(), 'aws', 'toolkits', 'language-servers')
    }

    defaultDownloadFolder() {
        return this.baseDir
    }

    /**
     * Performs a single, one-shot network request for a URL.
     * If a custom fetchFn was injected, uses that; otherwise uses the global `fetch` API
     * with AbortSignal for timeout cancellation.
     *
     * This deliberately makes exactly ONE HTTP request per call — no internal retries.
     * Outer retry logic is handled by fetchRemoteServer's 3-attempt loop.
     */
    private async doFetch(
        url: string,
        timeout: Timeout
    ): Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }> {
        if (this.fetchFn) {
            return this.fetchFn(url, timeout)
        }

        // Default one-shot fetch using global fetch + AbortSignal from Timeout
        const abortController = new AbortController()
        const disposable = timeout.token.onCancellationRequested(() => abortController.abort())
        try {
            const response = await globalThis.fetch(url, { signal: abortController.signal })
            return response
        } finally {
            disposable.dispose()
        }
    }

    private getDownloadDirectory(version: string) {
        return path.join(this.baseDir, version)
    }
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
