/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseLspInstaller } from '../../../shared/lsp/baseLspInstaller'
import { fs } from '../../../shared/fs/fs'
import { CfnLspName, CfnLspServerEnvType, CfnLspServerFile } from './lspServerConfig'
import { isAutomation, isBeta, isDebugInstance } from '../../../shared/vscode/env'
import { join } from 'path'
import { getLogger } from '../../../shared/logger/logger'
import { Manifest, ResourcePaths } from '../../../shared/lsp/types'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import { ManifestResolver } from '../../../shared/lsp/manifestResolver'
import { parseCfnManifest } from './cfnManifest'
import { toString } from '../utils'

const cfnManifestUrl =
    'https://raw.githubusercontent.com/aws-cloudformation/cloudformation-languageserver/refs/heads/main/assets/release-manifest.json'

function determineEnvironment(): CfnLspServerEnvType {
    if (isDebugInstance()) {
        return 'alpha'
    } else if (isBeta() || isAutomation()) {
        return 'beta'
    }
    return 'prod'
}

class CfnManifestResolver extends ManifestResolver {
    constructor(private readonly environment: CfnLspServerEnvType) {
        super(cfnManifestUrl, CfnLspName, 'cfnLsp')
    }

    protected override parseManifest(content: string): Manifest {
        getLogger('awsCfnLsp').info(`Parsing CloudFormation LSP manifest for ${this.environment}`)
        return parseCfnManifest(content, this.environment)
    }
}

export class CfnLspInstaller extends BaseLspInstaller {
    constructor() {
        super(
            {
                manifestUrl: cfnManifestUrl,
                supportedVersions: '<2.0.0',
                id: CfnLspName,
                suppressPromptPrefix: 'cfnLsp',
            },
            'awsCfnLsp',
            new CfnManifestResolver(determineEnvironment()),
            'sha256'
        )
    }

    protected async postInstall(assetDirectory: string): Promise<void> {
        const entries = nodeFs.readdirSync(assetDirectory, { withFileTypes: true })
        const folder = entries.find((e) => e.isDirectory())
        if (folder) {
            const rootDir = join(assetDirectory, folder.name)
            await fs.chmod(join(rootDir, 'bin', process.platform === 'win32' ? 'cfn-init.exe' : 'cfn-init'), 0o755)
        }
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
