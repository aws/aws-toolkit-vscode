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

const manifestUrl = 'https://aws-toolkit-language-servers.amazonaws.com/q-context/manifest.json'
// this LSP client in Q extension is only going to work with these LSP server versions
export const supportedLspServerVersions = '0.1.32'
export const lspWorkspaceName = 'AmazonQ-Workspace'

export class WorkspaceLSPResolver implements LspResolver {
    public constructor(
        private readonly options = {
            versionRange: new Range(supportedLspServerVersions),
            cleanUp: true,
        }
    ) {}

    async resolve(): Promise<LspResolution> {
        const manifest = await new ManifestResolver(manifestUrl, lspWorkspaceName).resolve()
        const installationResult = await new LanguageServerResolver(
            manifest,
            lspWorkspaceName,
            this.options.versionRange
        ).resolve()

        const nodeName =
            process.platform === 'win32' ? getNodeExecutableName() : `node-${process.platform}-${process.arch}`
        const nodePath = path.join(installationResult.assetDirectory, nodeName)
        await fs.chmod(nodePath, 0o755)

        if (this.options.cleanUp) {
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

    private async getDownloadedVersions(downloadDirectory: string): Promise<string[]> {
        return (await fs.readdir(downloadDirectory)).map(([f, _], __) => f)
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
        const downloadedVersions = await this.getDownloadedVersions(downloadDirectory)
        const [delistedVersions, remainingVersions] = partition(downloadedVersions, (v: string) =>
            this.isDelisted(manifestVersions, v)
        )
        for (const v of delistedVersions) {
            await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
        }

        for (const v of sort(remainingVersions).slice(0, -2)) {
            await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
        }
    }
}
