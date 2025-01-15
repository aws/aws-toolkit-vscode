/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Range } from 'semver'
import {
    ManifestResolver,
    LanguageServerResolver,
    LspResolver,
    fs,
    LspResolution,
    getNodeExecutableName,
} from 'aws-core-vscode/shared'
import path from 'path'

const manifestURL = 'https://aws-toolkit-language-servers.amazonaws.com/codewhisperer/0/manifest.json'
export const supportedLspServerVersions = '^2.3.0'

export class AmazonQLSPResolver implements LspResolver {
    async resolve(): Promise<LspResolution> {
        const overrideLocation = process.env.AWS_LANGUAGE_SERVER_OVERRIDE
        if (overrideLocation) {
            void vscode.window.showInformationMessage(`Using language server override location: ${overrideLocation}`)
            return {
                assetDirectory: overrideLocation,
                location: 'override',
                version: '0.0.0',
                resourcePaths: {
                    lsp: overrideLocation,
                    node: getNodeExecutableName(),
                },
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

        const nodePath = path.join(installationResult.assetDirectory, `servers/${getNodeExecutableName()}`)
        await fs.chmod(nodePath, 0o755)

        // TODO Cleanup old versions of language servers
        return {
            ...installationResult,
            resourcePaths: {
                lsp: path.join(installationResult.assetDirectory, 'servers/aws-lsp-codewhisperer.js'),
                node: nodePath,
            },
        }
    }
}
