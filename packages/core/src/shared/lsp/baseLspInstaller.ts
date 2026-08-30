/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nodePath from 'path'
import vscode from 'vscode'
import { LanguageServerResolver, verifyRequiredFiles } from './lspResolver'
import { ManifestResolver } from './manifestResolver'
import { LspResolution, Manifest, ResourcePaths } from './types'
import { cleanLspDownloads } from './utils/cleanup'
import { Range } from 'semver'
import { getLogger } from '../logger/logger'
import type { Logger, LogTopic } from '../logger/logger'
import fs from '../fs/fs'
import { TargetPlatformResolver } from './utils/targetResolver'

export interface LspConfig {
    manifestUrl: string
    supportedVersions: string
    id: string
    suppressPromptPrefix?: string
    path?: string
    /** Base root directory for language server downloads. Default: `<platform cache>/aws/toolkits` */
    baseDir?: string
    /** Optional files validated before publication and again after postInstall. */
    requiredFiles?: string[]
    /** Custom target platform resolver. Defaults to process.platform with legacy Linux detection. */
    targetPlatformResolver?: TargetPlatformResolver
}

export type ResolveManifest = () => Promise<Manifest>

export abstract class BaseLspInstaller<T extends ResourcePaths = ResourcePaths, Config extends LspConfig = LspConfig> {
    private logger: Logger
    private readonly installDir: string
    private resolvedInstallation?: LspResolution<T>

    constructor(
        protected config: Config,
        loggerName: Extract<LogTopic, 'amazonqLsp' | 'amazonqWorkspaceLsp' | 'awsCfnLsp'>,
        private readonly resolveManifest?: ResolveManifest,
        private readonly hashAlgorithm: string = 'sha384'
    ) {
        this.logger = getLogger(loggerName)
        const baseRoot = config.baseDir ?? nodePath.join(fs.getCacheDir(), 'aws', 'toolkits')
        this.installDir = nodePath.join(baseRoot, 'language-servers', config.id)
    }

    async resolve(): Promise<LspResolution<T>> {
        const { id, manifestUrl, supportedVersions, path } = this.config
        if (path) {
            const overrideMsg = `Using language server override location: ${path}`
            this.logger.info(overrideMsg)
            void vscode.window.showInformationMessage(overrideMsg)
            const resolution: LspResolution<T> = {
                assetDirectory: path,
                location: 'override',
                version: '0.0.0',
                resourcePaths: this.resourcePaths(),
            }
            this.resolvedInstallation = resolution
            return resolution
        }

        const manifest = this.resolveManifest
            ? await this.resolveManifest()
            : await new ManifestResolver({
                  manifestUrl,
                  lsName: id,
                  cacheDir: this.installDir,
                  suppressPrefix: this.config.suppressPromptPrefix,
              }).resolve()

        const serverResolver = new LanguageServerResolver(
            manifest,
            id,
            new Range(supportedVersions, {
                includePrerelease: true,
            }),
            manifestUrl,
            this.downloadMessageOverride,
            this.hashAlgorithm,
            this.installDir,
            this.config.requiredFiles,
            this.config.targetPlatformResolver
        )
        const installationResult = await serverResolver.resolve()

        const assetDirectory = installationResult.assetDirectory

        await this.runPostInstall(assetDirectory)

        const deletedVersions = await cleanLspDownloads(
            installationResult.version,
            manifest.versions,
            nodePath.dirname(assetDirectory),
            (versionDir) => serverResolver.isValidCacheDirectory(versionDir)
        )
        if (deletedVersions.length > 0) {
            this.logger.debug(`cleaning old LSP versions: deleted ${deletedVersions.length} versions`)
        }

        const resolution: LspResolution<T> = {
            ...installationResult,
            resourcePaths: this.resourcePaths(assetDirectory),
        }
        this.resolvedInstallation = resolution
        return resolution
    }

    /**
     * Invalidates the resolved installation. For managed installations, deletes the
     * asset directory to prevent rediscovering a broken cache on next resolve.
     */
    async invalidateResolvedInstallation(): Promise<void> {
        this.logger.info(`Invalidating resolved installation for "${this.config.id}"`)

        const resolved = this.resolvedInstallation
        if (resolved && resolved.location !== 'override') {
            // Only delete if the asset directory is within our managed installDir
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

        this.resolvedInstallation = undefined
    }

    getResolvedInstallation(): LspResolution<T> | undefined {
        return this.resolvedInstallation
    }

    protected downloadMessageOverride: string | undefined = undefined

    /** Runs client-specific setup, then verifies the optional configured file list. */
    protected async runPostInstall(assetDirectory: string): Promise<void> {
        await this.postInstall(assetDirectory)
        await verifyRequiredFiles(assetDirectory, this.config.requiredFiles ?? [])
    }

    protected abstract postInstall(assetDirectory: string): Promise<void>
    protected abstract resourcePaths(assetDirectory?: string): T
}
