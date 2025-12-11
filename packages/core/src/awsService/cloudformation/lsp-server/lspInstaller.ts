/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseLspInstaller } from '../../../shared/lsp/baseLspInstaller'
import { GitHubManifestAdapter } from './githubManifestAdapter'
import { fs } from '../../../shared/fs/fs'
import { CfnLspName, CfnLspServerEnvType, CfnLspServerFile } from './lspServerConfig'
import { isAutomation, isBeta, isDebugInstance } from '../../../shared/vscode/env'
import { dirname, join } from 'path'
import { getLogger } from '../../../shared/logger/logger'
import { ResourcePaths } from '../../../shared/lsp/types'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import globals from '../../../shared/extensionGlobals'
import { toString } from '../utils'

function determineEnvironment(): CfnLspServerEnvType {
    if (isDebugInstance()) {
        return 'alpha'
    } else if (isBeta() || isAutomation()) {
        return 'beta'
    }
    return 'prod'
}

export class CfnLspInstaller extends BaseLspInstaller {
    private readonly githubManifest = new GitHubManifestAdapter(
        'aws-cloudformation',
        'cloudformation-languageserver',
        determineEnvironment()
    )

    constructor() {
        super(
            {
                manifestUrl: 'github',
                supportedVersions: '<2.0.0',
                id: CfnLspName,
                suppressPromptPrefix: 'cfnLsp',
            },
            'awsCfnLsp',
            {
                resolve: async () => {
                    const log = getLogger('awsCfnLsp')
                    const cfnManifestStorageKey = 'aws.cloudformation.lsp.manifest'

                    try {
                        const manifest = await this.githubManifest.getManifest()
                        log.info(
                            `Creating CloudFormation LSP manifest for ${this.githubManifest.environment}`,
                            manifest.versions.map((v) => v.serverVersion)
                        )

                        // Cache in CloudFormation-specific global state storage
                        globals.globalState.tryUpdate(cfnManifestStorageKey, {
                            content: JSON.stringify(manifest),
                        })

                        return manifest
                    } catch (error) {
                        log.warn(`GitHub fetch failed, trying cached manifest: ${error}`)

                        // Try cached manifest from CloudFormation-specific storage
                        const manifestData = globals.globalState.tryGet(cfnManifestStorageKey, Object, {})

                        if (manifestData?.content) {
                            log.debug('Using cached manifest for offline mode')
                            return JSON.parse(manifestData.content)
                        }

                        log.error('No cached manifest found')
                        throw error
                    }
                },
            } as any
        )
    }

    protected async postInstall(assetDirectory: string): Promise<void> {
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

        // Find the single extracted directory
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
