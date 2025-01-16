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
import { telemetry } from '../../shared/telemetry'

const manifestUrl = 'https://aws-toolkit-language-servers.amazonaws.com/q-context/manifest.json'
// this LSP client in Q extension is only going to work with these LSP server versions
const supportedLspServerVersions = '0.1.32'

export class WorkspaceLSPResolver implements LspResolver {
    async resolve(): Promise<LspResolution> {
        const name = 'AmazonQ-Workspace'
        const manifest = await telemetry.lsp_setup.run(async (span) => {
            const startTime = performance.now()
            span.record({ lspSetupStage: 'fetchManifest' })
            const result = await new ManifestResolver(manifestUrl, name).resolve()
            span.record({
                lspSetupLocation: result.location ?? 'unknown',
                duration: performance.now() - startTime,
            })
            return result
        })

        const installationResult = await telemetry.lsp_setup.run(async (span) => {
            const startTime = performance.now()
            span.record({ lspSetupStage: 'serverCall' })
            const result = await new LanguageServerResolver(
                manifest,
                name,
                new Range(supportedLspServerVersions)
            ).resolve()
            span.record({
                lspSetupLocation: result.location ?? 'unknown',
                duration: performance.now() - startTime,
            })
            return result
        })

        const nodeName =
            process.platform === 'win32' ? getNodeExecutableName() : `node-${process.platform}-${process.arch}`
        const nodePath = path.join(installationResult.assetDirectory, nodeName)
        await fs.chmod(nodePath, 0o755)

        // TODO Cleanup old versions of language servers
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
