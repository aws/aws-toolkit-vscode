/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Range } from 'semver'
import { ManifestResolver, LanguageServerResolver, LspResolver, LspResult } from 'aws-core-vscode/shared'

const manifestURL = 'https://aws-toolkit-language-servers.amazonaws.com/codewhisperer/0/manifest.json'
export const supportedLspServerVersions = '^2.3.0'

export class AmazonQLSPResolver implements LspResolver {
    async resolve(): Promise<LspResult> {
        const overrideLocation = process.env.AWS_LANGUAGE_SERVER_OVERRIDE
        if (overrideLocation) {
            void vscode.window.showInformationMessage(`Using language server override location: ${overrideLocation}`)
            return {
                assetDirectory: overrideLocation,
                location: 'override',
                version: '0.0.0',
            }
        }

        // "AmazonQ" is shared across toolkits to provide a common access point, don't change it
        const name = 'AmazonQ'
        const manifest = await new ManifestResolver(manifestURL, name).resolve()
        const installationResult = await new LanguageServerResolver(
            manifest,
            name,
            new Range(supportedLspServerVersions)
        ).resolve()

        // TODO Cleanup old versions of language servers
        return installationResult
    }
}
