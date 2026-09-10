/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nodePath from 'path'
import vscode from 'vscode'
import {
    LanguageServerResolver,
    requireServerAndRequiredFiles,
    findHighestCompleteInstalledServer,
    hasServerAndRequiredFiles,
    versionSatisfiesRange,
} from './lspResolver'
import { ManifestResolver } from './manifestResolver'
import { LspResolution, Manifest, ResourcePaths } from './types'
import { cleanLspDownloads } from './utils/cleanup'
import { Range, parse } from 'semver'
import { getLogger } from '../logger/logger'
import type { Logger, LogTopic } from '../logger/logger'
import { ToolkitError } from '../errors'
import fs from '../fs/fs'
import { TargetPlatformResolver } from './utils/targetResolver'

export interface LspInstallerConfig {
    name: string
    supportedVersionRange: string
    manifestUrl: string
    serverFilename: string
    requiredFiles?: string[]
    storageDir?: string
    localBundleRoot?: string
    suppressPromptPrefix?: string
    targetPlatformResolver?: TargetPlatformResolver
}

export type ResolveManifest = () => Promise<Manifest>

export abstract class BaseLspInstaller<
    T extends ResourcePaths = ResourcePaths,
    Config extends LspInstallerConfig = LspInstallerConfig,
> {
    private logger: Logger
    private readonly installDir: string
    private resolvedInstallation?: LspResolution<T>

    constructor(
        protected config: Config,
        loggerName: Extract<LogTopic, 'amazonqLsp' | 'amazonqWorkspaceLsp' | 'awsCfnLsp'>,
        private readonly resolveManifest?: ResolveManifest
    ) {
        this.logger = getLogger(loggerName)
        this.installDir = config.storageDir ?? nodePath.join(fs.getCacheDir(), 'aws', 'language-servers', config.name)
    }

    async resolve(): Promise<LspResolution<T>> {
        const { name, manifestUrl, supportedVersionRange, localBundleRoot, serverFilename } = this.config
        if (localBundleRoot) {
            const serverPath = nodePath.join(localBundleRoot, serverFilename)
            if (!(await fs.existsFile(serverPath))) {
                throw new ToolkitError(
                    `Local "${name}" bundle at ${localBundleRoot} is missing server file "${serverFilename}"`,
                    { code: 'LspLocalBundleInvalid' }
                )
            }
            const resourcePaths = this.resourcePaths(localBundleRoot)
            const overrideMsg = `Using language server override location: ${localBundleRoot}`
            this.logger.info(overrideMsg)
            void vscode.window.showInformationMessage(overrideMsg)
            const resolution: LspResolution<T> = {
                assetDirectory: localBundleRoot,
                location: 'override',
                version: '0.0.0',
                resourcePaths,
            }
            this.resolvedInstallation = resolution
            return resolution
        }

        let manifest: Manifest
        try {
            manifest = this.resolveManifest
                ? await this.resolveManifest()
                : await new ManifestResolver({
                      manifestUrl,
                      lsName: name,
                      cacheDir: this.installDir,
                      suppressPrefix: this.config.suppressPromptPrefix,
                  }).resolve()
        } catch (manifestErr) {
            const offline = await this.resolveFromInstalledServers()
            if (offline) {
                return offline
            }
            throw ToolkitError.chain(manifestErr, `Failed to fetch manifest for "${name}"`, {
                code: 'ManifestFetchFailed',
            })
        }

        const serverResolver = new LanguageServerResolver(manifest, {
            lsName: name,
            versionRange: new Range(supportedVersionRange, { includePrerelease: true }),
            serverFilename,
            downloadMessage: this.downloadMessageOverride,
            storageDir: this.installDir,
            requiredFiles: this.config.requiredFiles,
            targetPlatformResolver: this.config.targetPlatformResolver,
        })
        let installationResult
        try {
            installationResult = await serverResolver.resolve()
        } catch (err) {
            if (manifest.location === 'cache' && err instanceof ToolkitError && err.code === 'NoCompatibleVersion') {
                const offline = await this.resolveFromInstalledServers()
                if (offline) {
                    return offline
                }
                throw ToolkitError.chain(err, `Failed to fetch manifest for "${name}"`, {
                    code: 'ManifestFetchFailed',
                })
            }
            throw err
        }

        const assetDirectory = installationResult.assetDirectory

        try {
            await this.runPostInstall(assetDirectory)
        } catch (err) {
            if (installationResult.location !== 'remote') {
                throw err
            }
            const installError =
                err instanceof ToolkitError && err.code === 'ExtractionFailed'
                    ? err
                    : ToolkitError.chain(err, `Failed to extract "${name}"`, { code: 'ExtractionFailed' })
            await this.removeFailedInstall(assetDirectory, installError)
            const fallback = await this.resolveFromInstalledServers()
            if (fallback) {
                return fallback
            }
            throw installError
        }

        const resolution: LspResolution<T> = {
            ...installationResult,
            resourcePaths: this.resourcePaths(assetDirectory),
        }
        this.resolvedInstallation = resolution
        return resolution
    }

    async cleanupAfterResolve(): Promise<void> {
        const resolved = this.resolvedInstallation
        if (!resolved || resolved.location === 'override') {
            return
        }

        try {
            const range = new Range(this.config.supportedVersionRange, { includePrerelease: true })
            const requiredFiles = this.config.requiredFiles ?? []
            const deletedVersions = await cleanLspDownloads(resolved.version, this.installDir, (dir) =>
                this.isValidInstalledDirectory(dir, range, requiredFiles)
            )
            if (deletedVersions.length > 0) {
                this.logger.debug(`cleaning old LSP versions: deleted ${deletedVersions.length} versions`)
            }
        } catch (err) {
            this.logger.warn(`Failed to cleanup old "${this.config.name}" versions: ${err}`)
        }
    }

    private async resolveFromInstalledServers(): Promise<LspResolution<T> | undefined> {
        const range = new Range(this.config.supportedVersionRange, { includePrerelease: true })
        const requiredFiles = this.config.requiredFiles ?? []

        const found = await findHighestCompleteInstalledServer(
            this.installDir,
            range,
            this.config.serverFilename,
            requiredFiles
        )
        if (!found) {
            return undefined
        }

        this.logger.warn(`Using fallback cached "${this.config.name}" server: ${found.version}`)

        await this.runPostInstall(found.directory)

        const resolution: LspResolution<T> = {
            location: 'fallback',
            version: found.version,
            assetDirectory: found.directory,
            resourcePaths: this.resourcePaths(found.directory),
        }
        this.resolvedInstallation = resolution
        return resolution
    }

    private async isValidInstalledDirectory(
        versionDir: string,
        range: Range,
        requiredFiles: readonly string[]
    ): Promise<boolean> {
        const version = parse(nodePath.basename(versionDir))
        if (!version || !versionSatisfiesRange(version, range)) {
            return false
        }
        return hasServerAndRequiredFiles(versionDir, this.config.serverFilename, requiredFiles)
    }

    private async removeFailedInstall(versionDir: string, cause: Error): Promise<void> {
        try {
            await fs.delete(versionDir, { force: true, recursive: true })
        } catch (cleanupError) {
            this.logger.warn(`Failed to remove failed "${this.config.name}" install at ${versionDir}: ${cleanupError}`)
            addSuppressed(cause, cleanupError)
        }
    }

    async invalidateResolvedInstallation(): Promise<void> {
        this.logger.info(`Invalidating resolved installation for "${this.config.name}"`)

        const resolved = this.resolvedInstallation
        this.resolvedInstallation = undefined
        if (resolved && resolved.location !== 'override') {
            const normalizedAsset = nodePath.resolve(resolved.assetDirectory)
            const normalizedInstallDir = nodePath.resolve(this.installDir)

            if (normalizedAsset.startsWith(normalizedInstallDir + nodePath.sep)) {
                try {
                    const exists = await fs.existsDir(normalizedAsset)
                    if (exists) {
                        this.logger.info(`Deleting broken installation at: ${normalizedAsset}`)
                        await fs.delete(normalizedAsset, { force: true, recursive: true })
                    }
                } catch (err) {
                    this.logger.warn(`Failed to delete broken installation at "${normalizedAsset}": ${err}`)
                }
            }
        }
    }

    getResolvedInstallation(): LspResolution<T> | undefined {
        return this.resolvedInstallation
    }

    protected downloadMessageOverride: string | undefined = undefined

    protected async runPostInstall(assetDirectory: string): Promise<void> {
        await this.postInstall(assetDirectory)
        await requireServerAndRequiredFiles(assetDirectory, this.config.serverFilename, this.config.requiredFiles ?? [])
    }

    protected abstract postInstall(assetDirectory: string): Promise<void>
    protected abstract resourcePaths(assetDirectory: string): T
}

function addSuppressed(error: Error, suppressed: unknown): void {
    const withSuppressed = error as Error & { suppressed?: unknown[] }
    withSuppressed.suppressed = [...(withSuppressed.suppressed ?? []), suppressed]
}
