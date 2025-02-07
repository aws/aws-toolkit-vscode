/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { LspResolution, LspResolver } from '../../shared/lsp/types'
import { ManifestResolver } from '../../shared/lsp/manifestResolver'
import { LanguageServerResolver } from '../../shared/lsp/lspResolver'
import { Range } from 'semver'
import { getNodeExecutableName } from '../../shared/lsp/utils/platform'
import { fs } from '../../shared/fs/fs'
import { cleanLspDownloads } from '../../shared'

const manifestUrl = 'https://aws-toolkit-language-servers.amazonaws.com/q-context/manifest.json'
// this LSP client in Q extension is only going to work with these LSP server versions
const supportedLspServerVersions = '0.1.35'

export class WorkspaceLSPResolver implements LspResolver {
    async resolve(): Promise<LspResolution> {
        const name = 'AmazonQ-Workspace'
        const manifest = await new ManifestResolver(manifestUrl, name).resolve()
        const installationResult = await new LanguageServerResolver(
            manifest,
            name,
            new Range(supportedLspServerVersions)
        ).resolve()

        const nodeName =
            process.platform === 'win32' ? getNodeExecutableName() : `node-${process.platform}-${process.arch}`
        const nodePath = path.join(installationResult.assetDirectory, nodeName)
        await fs.chmod(nodePath, 0o755)

        await cleanLspDownloads(manifest.versions, path.basename(installationResult.assetDirectory))
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
}
