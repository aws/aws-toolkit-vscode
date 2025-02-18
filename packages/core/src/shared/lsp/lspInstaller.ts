/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import vscode from 'vscode'
import { LspConfig } from '../../amazonq/lsp/config'
import { LanguageServerResolver } from './lspResolver'
import { ManifestResolver } from './manifestResolver'
import { LspResolution, ResourcePaths } from './types'
import { cleanLspDownloads } from './utils/cleanup'
import { Range } from 'semver'
import { getLogger } from '../logger/logger'

const logger = getLogger('lsp')

export abstract class BaseLspInstaller {
    constructor(protected config: LspConfig) {}

    async resolve(): Promise<LspResolution> {
        const { id, manifestUrl, supportedVersions, locationOverride } = this.config
        if (locationOverride) {
            void vscode.window.showInformationMessage(`Using language server override location: ${locationOverride}`)
            return {
                assetDirectory: locationOverride,
                location: 'override',
                version: '0.0.0',
                resourcePaths: this.resourcePaths(),
            }
        }

        const manifest = await new ManifestResolver(manifestUrl, id).resolve()
        const installationResult = await new LanguageServerResolver(
            manifest,
            id,
            new Range(supportedVersions, {
                includePrerelease: true,
            })
        ).resolve()

        const assetDirectory = installationResult.assetDirectory

        await this.postInstall(assetDirectory)

        const deletedVersions = await cleanLspDownloads(manifest.versions, path.dirname(assetDirectory))
        logger.debug(`cleaning old LSP versions deleted ${deletedVersions.length} versions`)

        return {
            ...installationResult,
            resourcePaths: this.resourcePaths(assetDirectory),
        }
    }

    protected abstract postInstall(assetDirectory: string): Promise<void>
    protected abstract resourcePaths(assetDirectory?: string): ResourcePaths
}
