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
import { FileType } from 'vscode'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports

function determineEnvironment(): CfnLspServerEnvType {
    if (isDebugInstance()) {
        return 'alpha'
    } else if (isBeta() || isAutomation()) {
        return 'beta'
    }
    return 'prod'
}

export class CfnLspInstaller extends BaseLspInstaller {
    private log = getLogger()

    constructor() {
        super(
            {
                manifestUrl: 'github',
                supportedVersions: '0.*.*',
                id: CfnLspName,
                suppressPromptPrefix: 'cfnLsp',
            },
            'awsCfnLsp',
            {
                resolve: async () => {
                    const environment = determineEnvironment()
                    this.log.info(`Resolving CloudFormation LSP from GitHub releases (${environment})`)
                    const githubAdapter = new GitHubManifestAdapter(
                        'aws-cloudformation',
                        'cloudformation-languageserver',
                        environment
                    )
                    return await githubAdapter.getManifest()
                },
            } as any
        )
    }

    protected async postInstall(assetDirectory: string): Promise<void> {
        const resourcePaths = this.resourcePaths(assetDirectory)
        const rootDir = dirname(resourcePaths.lsp)
        await this.makeLspExecutable(rootDir)
        await fs.chmod(join(rootDir, 'bin', process.platform === 'win32' ? 'cfn-init.exe' : 'cfn-init'), 0o755)
    }

    private async makeLspExecutable(directory: string): Promise<void> {
        const extensions = ['.cjs', '.gyp', '.js', '.mjs', '.node', '.wasm', '.json', '.zip', '.map']
        const entries = await fs.readdir(directory)

        for (const [name, type] of entries) {
            const fullPath = join(directory, name)
            if (type === FileType.Directory) {
                await this.makeLspExecutable(fullPath)
            } else if (extensions.some((ext) => name.endsWith(ext))) {
                try {
                    await fs.chmod(fullPath, 0o755)
                } catch (error) {
                    this.log.error(`Failed to make ${name} executable`, error)
                }
            }
        }
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
            throw new Error(`1 or more CloudFormation LSP folders found ${folders}`)
        }

        return {
            lsp: join(assetDirectory, folders[0].name, CfnLspServerFile),
            node: process.execPath,
        }
    }
}
