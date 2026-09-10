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
import { createHash } from '../crypto'
import { lspSetupStage, StageResolver, tryStageResolvers } from './utils/setupStage'
import { showProgressWithTimeout } from '../../shared/utilities/messages'
import { Timeout } from '../utilities/timeoutUtils'
import { oneMinute } from '../datetime'
import vscode from 'vscode'
import {
    TargetPlatform,
    TargetPlatformResolver,
    defaultTargetPlatformResolver,
    findCompatibleTarget,
} from './utils/targetResolver'

const remoteDownloadTimeout = oneMinute * 30

const artifactRequestTimeout = oneMinute * 5

const downloadMaxRetries = 3

const downloadBaseDelayMs = 500

const noCompatibleVersionCode = 'NoCompatibleVersion'
const hashIntegrityFailedCode = 'HashIntegrityFailed'
const downloadFailedCode = 'RemoteDownloadFailed'
const extractionFailedCode = 'ExtractionFailed'

function errorCode(err: unknown): string | undefined {
    return err instanceof ToolkitError ? err.code : undefined
}

function shouldPropagateWithoutFallback(err: unknown): boolean {
    const code = errorCode(err)
    return code === hashIntegrityFailedCode || code === noCompatibleVersionCode
}

async function pathExists(p: string): Promise<boolean> {
    return (await fs.existsFile(p)) || (await fs.existsDir(p))
}

export async function findServerFile(versionDir: string, serverFilename: string): Promise<string | undefined> {
    const direct = path.join(versionDir, serverFilename)
    if (await fs.existsFile(direct)) {
        return direct
    }
    if (!(await fs.existsDir(versionDir))) {
        return undefined
    }
    for (const [name, type] of await fs.readdir(versionDir)) {
        if ((type & FileType.Directory) !== 0) {
            const nested = path.join(versionDir, name, serverFilename)
            if (await fs.existsFile(nested)) {
                return nested
            }
        }
    }
    return undefined
}

export async function requireServerAndRequiredFiles(
    versionDir: string,
    serverFilename: string,
    requiredFiles: readonly string[]
): Promise<string> {
    const serverFile = await findServerFile(versionDir, serverFilename)
    if (!serverFile) {
        throw new ToolkitError(`Server file "${serverFilename}" not found after install`, {
            code: extractionFailedCode,
        })
    }

    const serverRoot = path.dirname(serverFile)
    const missing: string[] = []
    for (const requiredFile of requiredFiles) {
        if (!(await pathExists(path.join(serverRoot, requiredFile)))) {
            missing.push(requiredFile)
        }
    }
    if (missing.length > 0) {
        throw new ToolkitError(`Required files missing after install: ${missing.join(', ')}`, {
            code: extractionFailedCode,
        })
    }
    return serverFile
}

export async function hasServerAndRequiredFiles(
    versionDir: string,
    serverFilename: string,
    requiredFiles: readonly string[]
): Promise<boolean> {
    const serverFile = await findServerFile(versionDir, serverFilename)
    if (!serverFile) {
        return false
    }
    const serverRoot = path.dirname(serverFile)
    for (const requiredFile of requiredFiles) {
        if (!(await pathExists(path.join(serverRoot, requiredFile)))) {
            return false
        }
    }
    return true
}

/**
 * Range membership matching JetBrains `SemVerRange.satisfiedBy`: the inequality comparators
 * (`<` `<=` `>` `>=`) compare the candidate's core `major.minor.patch` and ignore its prerelease,
 * while equality compares the full version. So `<2.0.0` rejects `2.0.0-beta.1` yet admits
 * `1.5.0-beta.1`. node-semver's `includePrerelease` cannot express this: it admits `2.0.0-beta.1`
 * against `<2.0.0` because that prerelease sorts below `2.0.0`.
 */
export function versionSatisfiesRange(version: string | semver.SemVer, range: semver.Range): boolean {
    const parsed = typeof version === 'string' ? semver.parse(version) : version
    if (!parsed) {
        return false
    }
    const core = new semver.SemVer(`${parsed.major}.${parsed.minor}.${parsed.patch}`)
    return range.set.some((comparators) =>
        comparators.every((comparator) => {
            // The `*` / any comparator carries no concrete bound (its `semver` is a sentinel).
            if (!(comparator.semver instanceof semver.SemVer)) {
                return true
            }
            const bound = comparator.semver
            switch (comparator.operator) {
                case '':
                case '=':
                    return semver.eq(parsed, bound)
                case '<':
                    return semver.lt(core, bound)
                case '<=':
                    return semver.lte(core, bound)
                case '>':
                    return semver.gt(core, bound)
                case '>=':
                    return semver.gte(core, bound)
                default:
                    return false
            }
        })
    )
}

export async function findHighestCompleteInstalledServer(
    storageDir: string,
    versionRange: semver.Range,
    serverFilename: string,
    requiredFiles: readonly string[]
): Promise<{ directory: string; version: string } | undefined> {
    if (!(await fs.existsDir(storageDir))) {
        return undefined
    }

    const candidates = (await fs.readdir(storageDir))
        .filter(([, filetype]) => (filetype & FileType.Directory) !== 0)
        .map(([name]) => ({ name, parsed: semver.parse(name) }))
        .filter((c): c is { name: string; parsed: semver.SemVer } => c.parsed !== null)
        .filter((c) => versionSatisfiesRange(c.parsed, versionRange))
        .sort((a, b) => semver.compare(b.parsed, a.parsed))

    for (const candidate of candidates) {
        const directory = path.join(storageDir, candidate.name)
        if (await hasServerAndRequiredFiles(directory, serverFilename, requiredFiles)) {
            return { directory, version: candidate.name }
        }
    }

    return undefined
}

function normalizeArchivePath(name: string): string {
    return name.replace(/\\/g, '/')
}

export function zipEntryEscapesRoot(entryName: string): boolean {
    try {
        resolveWithinRoot(path.resolve(path.sep, 'lsp-install-root'), normalizeArchivePath(entryName))
        return false
    } catch {
        return true
    }
}

function resolveWithinRoot(root: string, relativePath: string): string {
    const normalizedRoot = path.resolve(root)
    const destination = path.resolve(normalizedRoot, relativePath)
    if (destination === normalizedRoot || !destination.startsWith(`${normalizedRoot}${path.sep}`)) {
        throw new Error(`Path escapes install root: ${relativePath}`)
    }
    return destination
}

interface ArtifactFetchResponse {
    status: number
    arrayBuffer(): Promise<ArrayBuffer>
}

export interface LspResolverConfig {
    lsName: string
    versionRange: semver.Range
    serverFilename: string
    downloadMessage?: string
    storageDir?: string
    requiredFiles?: string[]
    targetPlatformResolver?: TargetPlatformResolver
    fetchFn?: (url: string, timeout: Timeout) => Promise<ArtifactFetchResponse>
    sleepFn?: (ms: number) => Promise<void>
}

interface PlannedWrite {
    relativePath: string
    data?: Buffer
    mode?: number
}

export class LanguageServerResolver {
    private readonly lsName: string
    private readonly versionRange: semver.Range
    private readonly serverFilename: string
    private readonly downloadMessage: string
    private readonly storageDir: string
    private readonly requiredFiles: string[]
    private readonly targetPlatformResolver: TargetPlatformResolver
    private readonly fetchFn?: LspResolverConfig['fetchFn']
    private readonly sleepFn: (ms: number) => Promise<void>
    private resolvedTargetPlatform?: TargetPlatform

    constructor(
        private readonly manifest: Manifest,
        config: LspResolverConfig
    ) {
        this.lsName = config.lsName
        this.versionRange = config.versionRange
        this.serverFilename = config.serverFilename
        this.downloadMessage = config.downloadMessage ?? `Updating '${config.lsName}' language server`
        this.storageDir = config.storageDir ?? path.join(fs.getCacheDir(), 'aws', 'language-servers', config.lsName)
        this.requiredFiles = config.requiredFiles ?? []
        this.targetPlatformResolver = config.targetPlatformResolver ?? defaultTargetPlatformResolver
        this.fetchFn = config.fetchFn
        this.sleepFn = config.sleepFn ?? defaultSleep
    }

    async resolve() {
        function getServerVersion(result: LspResult) {
            return {
                languageServerVersion: result.version,
            }
        }
        const latestVersion = this.latestCompatibleLspVersion()
        const targetContents = this.getLSPTargetContents(latestVersion)
        const cacheDirectory = this.getDownloadDirectory(latestVersion.serverVersion)

        const primaryResolvers: StageResolver<LspResult>[] = [
            {
                resolve: async () => await this.getLocalServer(cacheDirectory, latestVersion),
                telemetryMetadata: { id: this.lsName, languageServerLocation: 'cache' },
            },
            {
                resolve: async () => await this.fetchRemoteServer(cacheDirectory, latestVersion, targetContents),
                telemetryMetadata: { id: this.lsName, languageServerLocation: 'remote' },
            },
        ]

        let resolved: LspResult
        try {
            resolved = await tryStageResolvers('getServer', primaryResolvers, getServerVersion)
        } catch (err) {
            if (shouldPropagateWithoutFallback(err)) {
                throw err
            }
            const fallbackResolvers: StageResolver<LspResult>[] = [
                {
                    resolve: async () => await this.getFallbackServer(err),
                    telemetryMetadata: { id: this.lsName, languageServerLocation: 'fallback' },
                },
            ]
            resolved = await tryStageResolvers('getServer', fallbackResolvers, getServerVersion)
        }

        logger.info('Finished preparing "%s" LSP server: %O', this.lsName, resolved.assetDirectory)
        return resolved
    }

    private async getFallbackServer(cause: unknown): Promise<LspResult> {
        const fallback = await findHighestCompleteInstalledServer(
            this.storageDir,
            this.versionRange,
            this.serverFilename,
            this.requiredFiles
        )
        if (fallback) {
            logger.info(
                `Unable to install latest ${this.lsName} language server. Launching previous version from ${fallback.directory}`
            )
            return {
                location: 'fallback',
                version: fallback.version,
                assetDirectory: fallback.directory,
            }
        }

        if (cause instanceof Error) {
            throw cause
        }
        throw new ToolkitError(`Failed to install "${this.lsName}" language server`, {
            code: downloadFailedCode,
        })
    }

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

    private async fetchRemoteServer(
        cacheDirectory: string,
        latestVersion: LspVersion,
        targetContents: TargetContent[]
    ): Promise<LspResult> {
        const timeout = await this.showDownloadProgress()
        try {
            await this.downloadRemoteTargetContent(targetContents, latestVersion, timeout)
            return {
                location: 'remote',
                version: latestVersion.serverVersion,
                assetDirectory: cacheDirectory,
            }
        } finally {
            timeout.dispose()
        }
    }

    private async getLocalServer(cacheDirectory: string, latestVersion: LspVersion): Promise<LspResult> {
        if (await this.hasValidLocalCache(cacheDirectory)) {
            return {
                location: 'cache',
                version: latestVersion.serverVersion,
                assetDirectory: cacheDirectory,
            }
        }
        // Reject without deleting: the in-place remote install overwrites this directory and owns
        // cleanup, removing it entirely only when a fresh install fails.
        throw new ToolkitError('Failed to retrieve server from cache', { code: 'InvalidCache' })
    }

    private async downloadRemoteTargetContent(
        contents: TargetContent[],
        lspVersion: LspVersion,
        timeout: Timeout
    ): Promise<void> {
        const versionDir = this.getDownloadDirectory(lspVersion.serverVersion)

        try {
            const downloaded: { content: TargetContent; data: Buffer }[] = []
            for (const content of contents) {
                const data = await this.downloadContent(content, timeout)
                this.verifyDownloadedSize(content, data)
                this.verifyContentIntegrity(content, data)
                downloaded.push({ content, data })
            }

            const plan = await lspSetupStage('validate', async () => this.buildInstallPlan(versionDir, downloaded))

            // We were instructed by legal to show this message
            const thirdPartyLicenses = lspVersion.thirdPartyLicenses
            logger.info(
                `Installing '${this.lsName}' Language Server v${lspVersion.serverVersion} to: ${versionDir}${thirdPartyLicenses ? ` (Attribution notice can be found at ${thirdPartyLicenses})` : ''}`
            )

            await fs.mkdir(versionDir)
            for (const entry of plan) {
                const destination = path.join(versionDir, entry.relativePath)
                if (entry.data === undefined) {
                    await fs.mkdir(destination)
                } else {
                    await fs.mkdir(path.dirname(destination))
                    await fs.writeFile(destination, entry.data)
                    if (entry.mode !== undefined && process.platform !== 'win32') {
                        await fs.chmod(destination, entry.mode)
                    }
                }
            }

            await this.validateInstall(versionDir)
        } catch (err) {
            await this.removeFailedInstall(versionDir, err)
            throw err
        }
    }

    /**
     * Preflights the full downloaded set into an ordered list of writes rooted at the version
     * directory: a non-ZIP content becomes one file; a ZIP content is expanded into its entries.
     * Every path is validated up front, so a rejected set writes nothing. ZIP archives are never
     * persisted — their bytes stay in memory and only the extracted entries reach disk.
     */
    private buildInstallPlan(
        versionDir: string,
        downloaded: { content: TargetContent; data: Buffer }[]
    ): PlannedWrite[] {
        const planned: PlannedWrite[] = []
        for (const { content, data } of downloaded) {
            if (isZipFilename(content.filename)) {
                let entries
                try {
                    entries = new AdmZip(data).getEntries()
                } catch (e) {
                    throw new ToolkitError(`Failed to read "${content.filename}" archive: ${e}`, {
                        code: extractionFailedCode,
                    })
                }
                for (const entry of entries) {
                    const normalizedEntryName = normalizeArchivePath(entry.entryName)
                    let relativePath: string
                    try {
                        relativePath = path.relative(versionDir, resolveWithinRoot(versionDir, normalizedEntryName))
                    } catch {
                        throw new ToolkitError(`Refusing to extract entry outside install root: ${entry.entryName}`, {
                            code: extractionFailedCode,
                        })
                    }
                    if (entry.isDirectory) {
                        planned.push({ relativePath })
                    } else {
                        let entryData: Buffer
                        try {
                            entryData = entry.getData()
                        } catch (e) {
                            throw new ToolkitError(`Failed to extract "${entry.entryName}": ${e}`, {
                                code: extractionFailedCode,
                            })
                        }
                        planned.push({ relativePath, data: entryData, mode: zipEntryPosixMode(entry.attr) })
                    }
                }
            } else {
                let relativePath: string
                try {
                    relativePath = path.relative(versionDir, resolveWithinRoot(versionDir, content.filename))
                } catch {
                    throw new ToolkitError(`Refusing to write content outside install root: ${content.filename}`, {
                        code: extractionFailedCode,
                    })
                }
                planned.push({ relativePath, data })
            }
        }
        return planned
    }

    /**
     * Recursively removes a failed install directory. If cleanup itself fails, the original error is
     * preserved: the cleanup failure is attached to it and logged, never rethrown in its place. This
     * mirrors JetBrains removeFailedInstall/addSuppressed as closely as JS allows.
     */
    private async removeFailedInstall(versionDir: string, cause: unknown): Promise<void> {
        try {
            await fs.delete(versionDir, { force: true, recursive: true })
        } catch (cleanupErr) {
            logger.error(`Failed to remove failed install at ${versionDir}: ${cleanupErr}`)
            addSuppressed(cause, cleanupErr)
        }
    }

    private verifyDownloadedSize(content: TargetContent, data: Buffer): void {
        if (content.bytes > 0 && data.length !== content.bytes) {
            throw new ToolkitError(
                `Downloaded size mismatch for ${this.lsName}/${content.filename}: expected ${content.bytes} bytes, got ${data.length}`,
                { code: downloadFailedCode }
            )
        }
    }

    private verifyContentIntegrity(content: TargetContent, data: Buffer): void {
        const hashes = content.hashes ?? []
        if (hashes.length === 0) {
            return
        }
        if (!this.verifyHash(data, hashes)) {
            logger.error('Invalid hash for %s', content.filename)
            throw new ToolkitError(`Hash verification failed for ${this.lsName}/${content.filename}`, {
                code: hashIntegrityFailedCode,
            })
        }
    }

    private verifyHash(data: Buffer, hashes: string[]): boolean {
        if (hashes.length === 0) {
            return true
        }

        for (const hashEntry of hashes) {
            const parsed = parseHashEntry(hashEntry)
            if (!parsed) {
                continue
            }

            try {
                const fullHash = createHash(parsed.algorithm, data)
                const colonPos = fullHash.indexOf(':')
                const actualDigest = colonPos >= 0 ? fullHash.substring(colonPos + 1) : fullHash

                if (actualDigest.toLowerCase() === parsed.digest.toLowerCase()) {
                    return true
                }
            } catch {
                logger.warn(`Unsupported hash algorithm "${parsed.algorithm}", skipping`)
            }
        }

        return false
    }

    private async validateInstall(directory: string): Promise<void> {
        await requireServerAndRequiredFiles(directory, this.serverFilename, this.requiredFiles)
    }

    async isValidCacheDirectory(localCacheDirectory: string): Promise<boolean> {
        const directoryVersion = semver.parse(path.basename(localCacheDirectory))
        if (!directoryVersion || !versionSatisfiesRange(directoryVersion, this.versionRange)) {
            return false
        }
        return hasServerAndRequiredFiles(localCacheDirectory, this.serverFilename, this.requiredFiles)
    }

    private async hasValidLocalCache(localCacheDirectory: string): Promise<boolean> {
        return hasServerAndRequiredFiles(localCacheDirectory, this.serverFilename, this.requiredFiles)
    }

    private getLSPTargetContents(version: LspVersion): TargetContent[] {
        const lspTarget = this.getCompatibleLspTarget(version)
        if (!lspTarget) {
            throw new ToolkitError("No language server target found matching the system's architecture and platform", {
                code: noCompatibleVersionCode,
            })
        }
        return lspTarget.contents ?? []
    }

    private latestCompatibleLspVersion() {
        if (this.manifest === null) {
            throw new ToolkitError('No valid manifest')
        }

        const latestCompatibleVersion =
            this.manifest.versions
                .filter((ver) => this.isCompatibleVersion(ver) && this.hasCompatibleTarget(ver))
                .sort((a, b) => semver.compare(b.serverVersion, a.serverVersion))[0] ?? undefined

        if (latestCompatibleVersion === undefined) {
            throw new ToolkitError(
                `Unable to find a language server that satisfies one or more of these conditions: version in range [${this.versionRange.range}], matching system's architecture and platform`,
                { code: noCompatibleVersionCode }
            )
        }

        return latestCompatibleVersion
    }

    private isCompatibleVersion(version: LspVersion) {
        if (semver.parse(version.serverVersion) === null) {
            return false
        }

        return versionSatisfiesRange(version.serverVersion, this.versionRange) && !version.isDelisted
    }

    private hasCompatibleTarget(version: LspVersion) {
        return this.getCompatibleLspTarget(version) !== undefined
    }

    private getCompatibleLspTarget(version: LspVersion) {
        return findCompatibleTarget(version, this.getTargetPlatform())
    }

    private getTargetPlatform(): TargetPlatform {
        if (!this.resolvedTargetPlatform) {
            this.resolvedTargetPlatform = this.targetPlatformResolver()
        }
        return this.resolvedTargetPlatform
    }

    private async downloadContent(content: TargetContent, progressTimeout: Timeout): Promise<Buffer> {
        let lastError: Error | undefined
        for (let attempt = 1; attempt <= downloadMaxRetries; attempt++) {
            const requestTimeout = new Timeout(artifactRequestTimeout)
            try {
                const response = await this.doFetch(content.url, requestTimeout, progressTimeout)
                if (response.status !== 200) {
                    throw new Error(`Failed to download "${content.filename}": HTTP ${response.status}`)
                }
                return Buffer.from(await response.arrayBuffer())
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err))
                if (attempt < downloadMaxRetries) {
                    await this.sleepFn(downloadBaseDelayMs * Math.pow(2, attempt - 1))
                }
            } finally {
                requestTimeout.dispose()
            }
        }
        throw new ToolkitError(
            `Failed to download "${content.filename}" after ${downloadMaxRetries} attempts: ${lastError?.message}`,
            { code: downloadFailedCode, cause: lastError }
        )
    }

    private async doFetch(
        url: string,
        requestTimeout: Timeout,
        progressTimeout?: Timeout
    ): Promise<ArtifactFetchResponse> {
        if (this.fetchFn) {
            return this.fetchFn(url, requestTimeout)
        }

        const abortController = new AbortController()
        const disposables = [requestTimeout.token.onCancellationRequested(() => abortController.abort())]
        if (progressTimeout) {
            disposables.push(progressTimeout.token.onCancellationRequested(() => abortController.abort()))
        }
        try {
            const response = await globalThis.fetch(url, { signal: abortController.signal })
            return response
        } finally {
            for (const disposable of disposables) {
                disposable.dispose()
            }
        }
    }

    private getDownloadDirectory(version: string): string {
        return path.join(this.storageDir, this.safeVersionDirectorySegment(version))
    }

    private safeVersionDirectorySegment(version: string): string {
        const reject = (reason: string) =>
            new ToolkitError(`Unsafe language server version "${version}": ${reason}`, {
                code: noCompatibleVersionCode,
            })

        if (semver.parse(version) === null) {
            throw reject('not valid semver')
        }
        if (version.includes('/') || version.includes('\\') || path.isAbsolute(version)) {
            throw reject('contains a path separator')
        }
        if (path.dirname(path.resolve(this.storageDir, version)) !== path.resolve(this.storageDir)) {
            throw reject('escapes the storage directory')
        }
        return version
    }
}

function parseHashEntry(hashEntry: string): { algorithm: string; digest: string } | undefined {
    const colonIdx = hashEntry.indexOf(':')
    if (colonIdx <= 0) {
        return undefined
    }
    const algorithm = hashEntry.substring(0, colonIdx).toLowerCase()
    const digest = hashEntry.substring(colonIdx + 1)
    if (!algorithm || !digest) {
        return undefined
    }
    return { algorithm, digest }
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function isZipFilename(filename: string): boolean {
    return filename.toLowerCase().endsWith('.zip')
}

/**
 * POSIX permission bits recorded in a ZIP entry's external attributes — the high 16 bits hold the
 * Unix `st_mode`, of which only the rwx (owner/group/other) permission bits are kept. A missing
 * Unix mode yields 0, matching JetBrains' application of an empty POSIX permission set.
 */
export function zipEntryPosixMode(externalAttributes: number): number {
    return (externalAttributes >>> 16) & 0o777
}

function addSuppressed(error: unknown, suppressed: unknown): void {
    if (error instanceof Error) {
        const withSuppressed = error as Error & { suppressed?: unknown[] }
        withSuppressed.suppressed = [...(withSuppressed.suppressed ?? []), suppressed]
    }
}
