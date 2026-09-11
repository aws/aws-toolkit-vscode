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
    private readonly logger: Logger
    private readonly installDir: string
    private readonly versionRange: Range
    private readonly requiredFiles: readonly string[]
    private resolvedInstallation?: LspResolution<T>

    constructor(
        protected config: Config,
        loggerName: Extract<LogTopic, 'amazonqLsp' | 'amazonqWorkspaceLsp' | 'awsCfnLsp'>,
        private readonly resolveManifest?: ResolveManifest
    ) {
        this.logger = getLogger(loggerName)
        this.installDir = config.storageDir ?? nodePath.join(fs.getCacheDir(), 'aws', 'language-servers', config.name)
        this.versionRange = new Range(config.supportedVersionRange, { includePrerelease: true })
        this.requiredFiles = config.requiredFiles ?? []
    }

    async resolve(): Promise<LspResolution<T>> {
        this.resolvedInstallation = undefined

        const { name, manifestUrl, localBundleRoot, serverFilename } = this.config
        if (localBundleRoot) {
            const serverPath = nodePath.join(localBundleRoot, serverFilename)
            if (!(await fs.existsFile(serverPath))) {
                throw new ToolkitError(
                    `Local "${name}" bundle at ${localBundleRoot} is missing server file "${serverFilename}"`,
                    { code: 'LspLocalBundleInvalid' }
                )
            }
            const resourcePaths = await this.resourcePaths(localBundleRoot)
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
            versionRange: this.versionRange,
            serverFilename,
            downloadMessage: this.downloadMessageOverride,
            storageDir: this.installDir,
            requiredFiles: this.requiredFiles,
            targetPlatformResolver: this.config.targetPlatformResolver,
        })
        let installationResult
        try {
            installationResult = await serverResolver.resolve()
        } catch (err) {
            // Unlike JetBrains, a stale cached manifest with no compatible version is treated as being
            // offline: an already-installed server is preferable to failing until the network returns.
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
            resourcePaths: await this.resourcePaths(assetDirectory),
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
            const deletedVersions = await cleanLspDownloads(resolved.version, this.installDir, (dir) =>
                this.isValidInstalledDirectory(dir)
            )
            if (deletedVersions.length > 0) {
                this.logger.debug(`cleaning old LSP versions: deleted ${deletedVersions.length} versions`)
            }
        } catch (err) {
            this.logger.warn(`Failed to cleanup old "${this.config.name}" versions: ${err}`)
        }
    }

    private async resolveFromInstalledServers(): Promise<LspResolution<T> | undefined> {
        const found = await findHighestCompleteInstalledServer(
            this.installDir,
            this.versionRange,
            this.config.serverFilename,
            this.requiredFiles
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
            resourcePaths: await this.resourcePaths(found.directory),
        }
        this.resolvedInstallation = resolution
        return resolution
    }

    private async isValidInstalledDirectory(versionDir: string): Promise<boolean> {
        const version = parse(nodePath.basename(versionDir))
        if (!version || !versionSatisfiesRange(version, this.versionRange)) {
            return false
        }
        return hasServerAndRequiredFiles(versionDir, this.config.serverFilename, this.requiredFiles)
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
        await requireServerAndRequiredFiles(assetDirectory, this.config.serverFilename, this.requiredFiles)
    }

    protected abstract postInstall(assetDirectory: string): Promise<void>
    protected abstract resourcePaths(assetDirectory: string): Promise<T>
}

function addSuppressed(error: Error, suppressed: unknown): void {
    const withSuppressed = error as Error & { suppressed?: unknown[] }
    withSuppressed.suppressed = [...(withSuppressed.suppressed ?? []), suppressed]
}
