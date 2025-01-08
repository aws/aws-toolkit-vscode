/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LspResolver, LspResult } from '../../shared/languageServer/types'
import { ManifestResolver } from '../../shared/languageServer/manifestResolver'
import { LanguageServerResolver } from '../../shared/languageServer/lspResolver'
import { Range } from 'semver'

const manifestUrl = 'https://aws-toolkit-language-servers.amazonaws.com/q-context/manifest.json'
// this LSP client in Q extension is only going to work with these LSP server versions
const supportedLspServerVersions = '0.1.32'

export class WorkspaceLSPResolver implements LspResolver {
    async resolve(): Promise<LspResult> {
        const name = 'AmazonQ-Workspace'
        const manifest = await new ManifestResolver(manifestUrl, name).resolve()
        const installationResult = await new LanguageServerResolver(
            manifest,
            name,
            new Range(supportedLspServerVersions)
        ).resolve()

        // TODO Cleanup old versions of language servers
        return installationResult
    }
}
