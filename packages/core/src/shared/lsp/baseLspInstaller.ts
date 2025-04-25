/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nodePath from 'path'
import vscode from 'vscode'
import { LspConfig } from '../../amazonq/lsp/config'
import { LanguageServerResolver } from './lspResolver'
import { ManifestResolver } from './manifestResolver'
import { LspResolution, ResourcePaths } from './types'
import { cleanLspDownloads } from './utils/cleanup'
import { Range } from 'semver'
import { getLogger } from '../logger/logger'
import type { Logger, LogTopic } from '../logger/logger'

export abstract class BaseLspInstaller<T extends ResourcePaths = ResourcePaths, Config extends LspConfig = LspConfig> {
    private logger: Logger

    constructor(
        protected config: Config,
        loggerName: Extract<LogTopic, 'amazonqLsp' | 'amazonqWorkspaceLsp'>
    ) {
        this.logger = getLogger(loggerName)
    }

    async resolve(): Promise<LspResolution<T>> {
        const { id, manifestUrl, supportedVersions, path, suppressPromptPrefix } = this.config
        if (path) {
            const overrideMsg = `Using language server override location: ${path}`
            this.logger.info(overrideMsg)
            void vscode.window.showInformationMessage(overrideMsg)
            return {
                assetDirectory: path,
                location: 'override',
                version: '0.0.0',
                resourcePaths: this.resourcePaths(),
            }
        }

        const manifest = await new ManifestResolver(manifestUrl, id, suppressPromptPrefix).resolve()
        const installationResult = await new LanguageServerResolver(
            manifest,
            id,
            new Range(supportedVersions, {
                includePrerelease: true,
            })
        ).resolve()

        const assetDirectory = installationResult.assetDirectory

        await this.postInstall(assetDirectory)

        const deletedVersions = await cleanLspDownloads(
            installationResult.version,
            manifest.versions,
            nodePath.dirname(assetDirectory)
        )
        if (deletedVersions.length > 0) {
            this.logger.debug(`cleaning old LSP versions: deleted ${deletedVersions.length} versions`)
        }

        const r = {
            ...installationResult,
            // Example:
            // ```
            // resourcePaths = {
            //     lsp = '<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/servers/aws-lsp-codewhisperer.js'
            //     node = '<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/servers/node'
            //     ui = '<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/clients/amazonq-ui.js'
            // }
            // ```
            resourcePaths: this.resourcePaths(assetDirectory),
        }
        return r
    }

    protected abstract postInstall(assetDirectory: string): Promise<void>
    protected abstract resourcePaths(assetDirectory?: string): T
}
