/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    ManifestResolver,
    LanguageServerResolver,
    LspResolver,
    fs,
    LspResolution,
    getNodeExecutableName,
    cleanLspDownloads,
    getLogger,
} from 'aws-core-vscode/shared'
import path from 'path'
import { Range } from 'semver'
import { getAmazonQLspConfig } from './config'

const logger = getLogger('amazonqLsp')

export class AmazonQLSPResolver implements LspResolver {
    async resolve(): Promise<LspResolution> {
        const { id, manifestUrl, supportedVersions, locationOverride } = getAmazonQLspConfig()
        if (locationOverride) {
            void vscode.window.showInformationMessage(`Using language server override location: ${locationOverride}`)
            return {
                assetDirectory: locationOverride,
                location: 'override',
                version: '0.0.0',
                resourcePaths: {
                    lsp: locationOverride,
                    node: getNodeExecutableName(),
                },
            }
        }

        // "AmazonQ" is shared across toolkits to provide a common access point, don't change it
        const manifest = await new ManifestResolver(manifestUrl, id).resolve()
        const installationResult = await new LanguageServerResolver(
            manifest,
            id,
            new Range(supportedVersions, {
                includePrerelease: true,
            })
        ).resolve()

        const nodePath = path.join(installationResult.assetDirectory, `servers/${getNodeExecutableName()}`)
        await fs.chmod(nodePath, 0o755)

        const deletedVersions = await cleanLspDownloads(
            manifest.versions,
            path.dirname(installationResult.assetDirectory)
        )
        logger.debug(`Cleaned up ${deletedVersions.length} old versions`)

        return {
            ...installationResult,
            resourcePaths: {
                lsp: path.join(installationResult.assetDirectory, 'servers/aws-lsp-codewhisperer.js'),
                node: nodePath,
            },
        }
    }
}
