/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { LspResolution, LspResolver, LspVersion } from '../../shared/lsp/types'
import { ManifestResolver } from '../../shared/lsp/manifestResolver'
import { LanguageServerResolver } from '../../shared/lsp/lspResolver'
import { Range, sort } from 'semver'
import { getNodeExecutableName } from '../../shared/lsp/utils/platform'
import { fs } from '../../shared/fs/fs'
import { partition } from '../../shared/utilities/tsUtils'
import { getDownloadedVersions } from './util'

export const lspManifestUrl = 'https://aws-toolkit-language-servers.amazonaws.com/q-context/manifest.json'
// this LSP client in Q extension is only going to work with these LSP server versions
export const supportedLspServerVersions = '0.1.32'
export const lspWorkspaceName = 'AmazonQ-Workspace'

export class WorkspaceLSPResolver implements LspResolver {
    private readonly versionRange: Range
    private readonly shouldCleanUp: boolean
    public constructor(
        options?: Partial<{
            versionRange: Range
            cleanUp: boolean
        }>
    ) {
        this.versionRange = options?.versionRange ?? new Range(supportedLspServerVersions)
        this.shouldCleanUp = options?.cleanUp ?? true
    }

    async resolve(): Promise<LspResolution> {
        const manifest = await new ManifestResolver(lspManifestUrl, lspWorkspaceName).resolve()
        const installationResult = await new LanguageServerResolver(
            manifest,
            lspWorkspaceName,
            this.versionRange
        ).resolve()

        const nodeName =
            process.platform === 'win32' ? getNodeExecutableName() : `node-${process.platform}-${process.arch}`
        const nodePath = path.join(installationResult.assetDirectory, nodeName)
        await fs.chmod(nodePath, 0o755)

        if (this.shouldCleanUp) {
            await this.cleanUp(manifest.versions, path.dirname(installationResult.assetDirectory))
        }
        return {
            ...installationResult,
            resourcePaths: {
                lsp: path.join(
                    installationResult.assetDirectory,
                    `qserver-${process.platform}-${process.arch}/qserver/lspServer.js`
                ),
                node: nodePath,
            },
        }
    }

    private isDelisted(manifestVersions: LspVersion[], targetVersion: string): boolean {
        return manifestVersions.find((v) => v.serverVersion === targetVersion)?.isDelisted ?? false
    }

    /**
     * Delete all delisted versions and keep the two newest versions that remain
     * @param manifest
     * @param downloadDirectory
     */
    async cleanUp(manifestVersions: LspVersion[], downloadDirectory: string): Promise<void> {
        const downloadedVersions = await getDownloadedVersions(downloadDirectory)
        const [delistedVersions, remainingVersions] = partition(downloadedVersions, (v: string) =>
            this.isDelisted(manifestVersions, v)
        )
        for (const v of delistedVersions) {
            await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
        }

        if (remainingVersions.length <= 2) {
            return
        }

        for (const v of sort(remainingVersions).slice(0, -2)) {
            await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
        }
    }
}
