/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseLspInstaller, ResolveManifest } from '../../../shared/lsp/baseLspInstaller'
import { ManifestResolver, ManifestAdapter } from '../../../shared/lsp/manifestResolver'
import { fs } from '../../../shared/fs/fs'
import { CfnLspName, CfnLspServerFile, RequiredFiles, CfnLspServerEnvType } from './lspServerConfig'
import { isAutomation, isBeta, isDebugInstance } from '../../../shared/vscode/env'
import { dirname, join } from 'path'
import { getLogger } from '../../../shared/logger/logger'
import { ResourcePaths, Manifest } from '../../../shared/lsp/types'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import { CfnLspVersion } from './utils'
import { toString } from '../utils'

function determineEnvironment(): CfnLspServerEnvType {
    if (isDebugInstance()) {
        return 'alpha'
    } else if (isBeta() || isAutomation()) {
        return 'beta'
    }
    return 'prod'
}

const cfnManifestUrl =
    'https://raw.githubusercontent.com/aws-cloudformation/cloudformation-languageserver/refs/heads/main/assets/release-manifest.json'

/**
 * Manifest adapter for CloudFormation LSP.
 * Transforms the channel-keyed raw manifest (with alpha/beta/prod keys)
 * into a normalized Manifest with only the relevant environment's versions.
 */
class CfnManifestAdapter implements ManifestAdapter {
    constructor(private readonly environment: CfnLspServerEnvType) {}

    adapt(raw: unknown): Manifest {
        const rawObj = raw as Record<string, unknown>

        // The CFN manifest has environment-keyed version arrays
        const envVersions = rawObj[this.environment] as CfnLspVersion[] | undefined
        if (envVersions && Array.isArray(envVersions)) {
            getLogger('awsCfnLsp').info(
                `Adapted CloudFormation LSP manifest for ${this.environment}: ${envVersions.length} versions`
            )
            return {
                manifestSchemaVersion: (rawObj.manifestSchemaVersion as string) ?? '1.0',
                artifactId: (rawObj.artifactId as string) ?? CfnLspName,
                artifactDescription: (rawObj.artifactDescription as string) ?? 'CloudFormation Language Server',
                isManifestDeprecated: (rawObj.isManifestDeprecated as boolean) ?? false,
                versions: envVersions,
            }
        }

        // Fallback to the generic flat shape only when a top-level versions array exists.
        if (!Array.isArray(rawObj.versions)) {
            throw new TypeError(
                "Manifest must contain versions for the requested environment or a top-level 'versions' array"
            )
        }
        return raw as Manifest
    }
}

function createCfnManifestResolver(environment: CfnLspServerEnvType, baseRoot: string): ResolveManifest {
    return () => {
        const cacheDir = join(baseRoot, 'language-servers', CfnLspName)
        return new ManifestResolver({
            manifestUrl: cfnManifestUrl,
            lsName: CfnLspName,
            cacheDir,
            adapter: new CfnManifestAdapter(environment),
        }).resolve()
    }
}

export interface CfnLspInstallerOptions {
    /**
     * Optional base root directory for language server downloads.
     * Default: `<platformCacheDir>/aws/toolkits`
     */
    baseRoot?: string
}

export class CfnLspInstaller extends BaseLspInstaller {
    constructor(options?: CfnLspInstallerOptions) {
        const environment = determineEnvironment()
        const baseRoot = options?.baseRoot ?? join(fs.getCacheDir(), 'aws', 'toolkits')

        super(
            {
                manifestUrl: cfnManifestUrl,
                supportedVersions: '<2.0.0',
                id: CfnLspName,
                baseDir: baseRoot,
                requiredFiles: RequiredFiles,
            },
            'awsCfnLsp',
            createCfnManifestResolver(environment, baseRoot),
            'sha256'
        )
    }

    protected async postInstall(assetDirectory: string): Promise<void> {
        const resourcePaths = this.resourcePaths(assetDirectory)
        const rootDir = dirname(resourcePaths.lsp)
        const cfnInitPath = join(rootDir, 'bin', process.platform === 'win32' ? 'cfn-init.exe' : 'cfn-init')
        if (await fs.existsFile(cfnInitPath)) {
            await fs.chmod(cfnInitPath, 0o755)
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
            throw new Error(`${folders.length} CloudFormation LSP folders found ${toString(folders)}`)
        }

        return {
            lsp: join(assetDirectory, folders[0].name, CfnLspServerFile),
            node: process.execPath,
        }
    }
}
