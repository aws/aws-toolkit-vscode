/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseLspInstaller } from '../../../shared/lsp/baseLspInstaller'
import { GitHubManifestAdapter } from './githubManifestAdapter'
import { fs } from '../../../shared/fs/fs'
import { CfnLspName, CfnLspServerEnvType, CfnLspServerFile } from './lspServerConfig'
import { isAutomation, isBeta } from '../../../shared/vscode/env'
import { basename, dirname, join } from 'path'
import { getLogger } from '../../../shared/logger/logger'
import { LspResolution, ResourcePaths } from '../../../shared/lsp/types'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import { getDownloadedVersions } from '../../../shared/lsp/utils/cleanup'
import { InUseTracker } from '../../../shared/lsp/utils/inUseTracker'
import { useOldLinuxVersion, mapLegacyLinux } from './utils'
import { toString } from '../utils'
import { coerce, satisfies, sort } from 'semver'

function determineEnvironment(): CfnLspServerEnvType {
    if (isBeta() || isAutomation()) {
        return 'beta'
    }
    return 'prod'
}

const ManifestCacheFile = 'manifest.json'

const SupportedVersionRange = '<2.0.0'

/** CFN-specific cache root. Lazy to avoid calling fs.getCacheDir() before globals are initialized. */
function getCfnLspRootDir() {
    return join(fs.getCacheDir(), 'aws', 'language-servers')
}

export class CfnLspInstaller extends BaseLspInstaller {
    private readonly githubManifest = new GitHubManifestAdapter(determineEnvironment())
    readonly inUseTracker = new InUseTracker()

    constructor() {
        super(
            {
                manifestUrl: 'github',
                supportedVersions: SupportedVersionRange,
                id: CfnLspName,
                suppressPromptPrefix: 'cfnLsp',
                rootDir: getCfnLspRootDir(),
            },
            'awsCfnLsp',
            {
                resolve: async () => {
                    const log = getLogger('awsCfnLsp')
                    const env = determineEnvironment()
                    const downloadRoot = join(getCfnLspRootDir(), CfnLspName)
                    const cachePath = join(downloadRoot, ManifestCacheFile)

                    const writeRawManifestCache = async () => {
                        try {
                            const rawManifestText = this.githubManifest.getLastRawManifest()
                            if (!rawManifestText) {
                                return
                            }
                            await fs.mkdir(downloadRoot)
                            const tmpPath = `${cachePath}.tmp.${process.pid}`
                            await fs.writeFile(tmpPath, rawManifestText)
                            nodeFs.renameSync(tmpPath, cachePath)
                        } catch (cacheErr) {
                            log.debug(`Failed to cache manifest: ${cacheErr}`)
                        }
                    }

                    try {
                        const manifest = await this.githubManifest.getManifest()
                        log.info(
                            `CloudFormation LSP manifest for ${env}`,
                            manifest.versions.map((v) => v.serverVersion)
                        )

                        await writeRawManifestCache()

                        if (!manifest.versions?.length) {
                            throw new Error(`No versions in manifest for environment '${env}'`)
                        }
                        return manifest
                    } catch (fetchError) {
                        // Raw manifest may have been populated even if getManifest() threw later
                        await writeRawManifestCache()
                        log.warn(`GitHub fetch failed, trying cached manifest: ${fetchError}`)
                    }

                    try {
                        if (await fs.existsFile(cachePath)) {
                            const cachedManifestText = await fs.readFileText(cachePath)
                            const cachedManifest = JSON.parse(cachedManifestText)
                            let versions = cachedManifest[env]
                            if (!versions?.length) {
                                throw new Error(`No versions in cached manifest for environment '${env}'`)
                            }
                            if (process.platform === 'linux' && useOldLinuxVersion()) {
                                versions = mapLegacyLinux(versions)
                            }
                            log.info('Using cached manifest for offline mode')
                            return {
                                manifestSchemaVersion: cachedManifest.manifestSchemaVersion,
                                artifactId: cachedManifest.artifactId,
                                artifactDescription: cachedManifest.artifactDescription,
                                isManifestDeprecated: cachedManifest.isManifestDeprecated,
                                versions,
                            }
                        }
                    } catch (cacheReadErr) {
                        log.warn(`Failed to read cached manifest: ${cacheReadErr}`)
                    }

                    // Throw to trigger resolve() fallback to local installation
                    throw new Error('Failed to fetch manifest and no cached manifest available')
                },
            } as any,
            'sha256'
        )
    }

    override async resolve(): Promise<LspResolution<ResourcePaths>> {
        try {
            return await super.resolve()
        } catch (err) {
            const log = getLogger('awsCfnLsp')
            log.warn(`Standard resolve failed, searching for installed LSP: ${err}`)

            const downloadRoot = join(getCfnLspRootDir(), CfnLspName)
            const fallbackDir = await this.findLocalFallback(downloadRoot)
            if (fallbackDir) {
                log.info(`Using locally installed fallback: ${fallbackDir}`)
                this.inUseTracker.writeMarker(fallbackDir, 'aws-toolkit-vscode')
                return {
                    assetDirectory: fallbackDir,
                    location: 'fallback',
                    version: basename(fallbackDir),
                    resourcePaths: this.resourcePaths(fallbackDir),
                }
            }

            throw err
        }
    }

    private async findLocalFallback(downloadRoot: string): Promise<string | undefined> {
        try {
            const versions = await getDownloadedVersions(downloadRoot)
            const compatible = versions.filter((v) => {
                const parsed = coerce(v)
                return parsed !== null && satisfies(parsed, SupportedVersionRange)
            })
            const sorted = sort(compatible)
            for (const version of sorted.reverse()) {
                const dir = join(downloadRoot, version)
                const entries = nodeFs.readdirSync(dir, { withFileTypes: true })
                const folders = entries.filter((e) => e.isDirectory())
                for (const folder of folders) {
                    const serverFile = join(dir, folder.name, CfnLspServerFile)
                    if (nodeFs.existsSync(serverFile)) {
                        return dir
                    }
                }
            }
        } catch (err) {
            getLogger('awsCfnLsp').debug(`No local versions available: ${err}`)
        }
        return undefined
    }

    protected async postInstall(assetDirectory: string): Promise<void> {
        // Write in-use marker BEFORE cleanLspDownloads (called by base resolve) so peer cleanups see us
        this.inUseTracker.writeMarker(assetDirectory, 'aws-toolkit-vscode')

        const resourcePaths = this.resourcePaths(assetDirectory)
        const rootDir = dirname(resourcePaths.lsp)
        await fs.chmod(join(rootDir, 'bin', process.platform === 'win32' ? 'cfn-init.exe' : 'cfn-init'), 0o755)
    }

    protected resourcePaths(assetDirectory?: string): ResourcePaths {
        if (!assetDirectory) {
            return {
                lsp: this.config.path ?? CfnLspServerFile,
                node: process.execPath,
            }
        }

        const entries = nodeFs.readdirSync(assetDirectory, { withFileTypes: true })
        const folders = entries.filter((entry) => entry.isDirectory())

        if (folders.length !== 1) {
            throw new Error(`${folders.length} CloudFormation LSP folders found ${toString(folders)}`)
        }

        return {
            lsp: join(assetDirectory, folders[0].name, CfnLspServerFile),
            node: process.execPath,
        }
    }
}
