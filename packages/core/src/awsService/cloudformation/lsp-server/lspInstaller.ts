/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseLspInstaller, LspInstallerConfig, ResolveManifest } from '../../../shared/lsp/baseLspInstaller'
import { ManifestResolver, ManifestAdapter } from '../../../shared/lsp/manifestResolver'
import { fs } from '../../../shared/fs/fs'
import { CfnLspName, CfnLspServerFile, RequiredFiles, CfnLspServerEnvType } from './lspServerConfig'
import { isAutomation } from '../../../shared/vscode/env'
import { dirname, join } from 'path'
import { getLogger } from '../../../shared/logger/logger'
import { ResourcePaths, Manifest } from '../../../shared/lsp/types'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import { CfnLspVersion } from './utils'

const cfnManifestUrl =
    'https://raw.githubusercontent.com/aws-cloudformation/cloudformation-languageserver/main/assets/release-manifest.json'

export function determineEnvironment(): CfnLspServerEnvType {
    const override = process.env.CFN_LSP_ENVIRONMENT?.trim().toLowerCase()
    if (override === 'alpha' || override === 'beta' || override === 'prod') {
        return override
    }
    return isAutomation() ? 'beta' : 'prod'
}

export function cfnLocalBundleRoot(rawPath = process.env.CFN_LSP_BUNDLE): string | undefined {
    const trimmed = rawPath?.trim()
    return trimmed ? trimmed : undefined
}

export function cfnStorageDir(): string {
    return join(fs.getCacheDir(), 'aws', 'language-servers', CfnLspName)
}

export interface CfnLspInstallerOptions {
    storageDir?: string
}

export function cfnInstallerConfig(options?: CfnLspInstallerOptions): LspInstallerConfig & { storageDir: string } {
    return {
        name: CfnLspName,
        supportedVersionRange: '<2.0.0',
        manifestUrl: cfnManifestUrl,
        serverFilename: CfnLspServerFile,
        requiredFiles: RequiredFiles,
        storageDir: options?.storageDir ?? cfnStorageDir(),
        localBundleRoot: cfnLocalBundleRoot(),
    }
}

export class CfnManifestAdapter implements ManifestAdapter {
    constructor(private readonly environment: CfnLspServerEnvType) {}

    adapt(raw: unknown): Manifest {
        const rawObj = raw as Record<string, unknown>

        const envVersions = rawObj[this.environment]
        if (!Array.isArray(envVersions)) {
            throw new TypeError(`Manifest contains no versions for environment '${this.environment}'`)
        }

        getLogger('awsCfnLsp').info(
            `Adapted CloudFormation LSP manifest for ${this.environment}: ${envVersions.length} versions`
        )
        return {
            manifestSchemaVersion: (rawObj.manifestSchemaVersion as string) ?? '1.0',
            artifactId: (rawObj.artifactId as string) ?? CfnLspName,
            artifactDescription: (rawObj.artifactDescription as string) ?? 'CloudFormation Language Server',
            isManifestDeprecated: (rawObj.isManifestDeprecated as boolean) ?? false,
            versions: envVersions as CfnLspVersion[],
        }
    }
}

function createCfnManifestResolver(environment: CfnLspServerEnvType, storageDir: string): ResolveManifest {
    return () =>
        new ManifestResolver({
            manifestUrl: cfnManifestUrl,
            lsName: CfnLspName,
            cacheDir: storageDir,
            adapter: new CfnManifestAdapter(environment),
        }).resolve()
}

export class CfnLspInstaller extends BaseLspInstaller {
    constructor(options?: CfnLspInstallerOptions) {
        const config = cfnInstallerConfig(options)
        super(config, 'awsCfnLsp', createCfnManifestResolver(determineEnvironment(), config.storageDir))
    }

    async cleanupAfterResolveWithLegacy(): Promise<void> {
        this.cleanupLegacyStorageDir()
        await this.cleanupAfterResolve()
    }

    private cleanupLegacyStorageDir(): void {
        // TODO: Delete the legacy <cache>/aws/toolkits/language-servers location in a future release.
    }

    protected async postInstall(assetDirectory: string): Promise<void> {
        if (process.platform === 'win32') {
            return
        }

        const rootDir = dirname(this.resourcePaths(assetDirectory).lsp)
        const cfnInitPath = join(rootDir, 'bin', 'cfn-init')

        try {
            if (await fs.existsFile(cfnInitPath)) {
                // Match Java File.setExecutable(true, false): keep the existing read/write bits and
                // add execute for owner, group, and others, rather than forcing 0o755.
                const currentMode = nodeFs.statSync(cfnInitPath).mode
                await fs.chmod(cfnInitPath, withExecutableBits(currentMode))
            }
        } catch (err) {
            getLogger('awsCfnLsp').warn(`Failed to chmod cfn-init at "${cfnInitPath}" (continuing): ${err}`)
        }
    }

    protected resourcePaths(assetDirectory: string): ResourcePaths {
        const directServer = join(assetDirectory, CfnLspServerFile)
        if (nodeFs.existsSync(directServer)) {
            return { lsp: directServer, node: process.execPath }
        }

        const nestedServer = nodeFs
            .readdirSync(assetDirectory)
            .filter((name) => isDirectoryFollowingSymlinks(join(assetDirectory, name)))
            .map((name) => join(assetDirectory, name, CfnLspServerFile))
            .find((candidate) => nodeFs.existsSync(candidate))

        if (!nestedServer) {
            throw new Error(`CloudFormation LSP server file not found under ${assetDirectory}`)
        }

        return { lsp: nestedServer, node: process.execPath }
    }
}

export function withExecutableBits(mode: number): number {
    return mode | 0o111
}

function isDirectoryFollowingSymlinks(path: string): boolean {
    try {
        return nodeFs.statSync(path).isDirectory()
    } catch {
        return false
    }
}
