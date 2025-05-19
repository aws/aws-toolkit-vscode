/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fs, getNodeExecutableName, getRgExecutableName, BaseLspInstaller, ResourcePaths } from 'aws-core-vscode/shared'
import path from 'path'
import { ExtendedAmazonQLSPConfig, getAmazonQLspConfig } from './config'

export interface AmazonQResourcePaths extends ResourcePaths {
    ui: string
    /**
     * Path to `rg` (or `rg.exe`) executable/binary.
     * Example: `"<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/servers/rg"`
     */
    ripGrep: string
}

export class AmazonQLspInstaller extends BaseLspInstaller.BaseLspInstaller<
    AmazonQResourcePaths,
    ExtendedAmazonQLSPConfig
> {
    constructor(lspConfig: ExtendedAmazonQLSPConfig = getAmazonQLspConfig()) {
        super(lspConfig, 'amazonqLsp')
    }

    protected override async postInstall(assetDirectory: string): Promise<void> {
        const resourcePaths = this.resourcePaths(assetDirectory)
        await fs.chmod(resourcePaths.node, 0o755)
        if (await fs.exists(resourcePaths.ripGrep)) {
            await fs.chmod(resourcePaths.ripGrep, 0o755)
        }
    }

    protected override resourcePaths(assetDirectory?: string): AmazonQResourcePaths {
        if (!assetDirectory) {
            return {
                lsp: this.config.path ?? '',
                node: getNodeExecutableName(),
                ripGrep: `ripgrep/${getRgExecutableName()}`,
                ui: this.config.ui ?? '',
            }
        }

        const nodePath = path.join(assetDirectory, `servers/${getNodeExecutableName()}`)
        const rgPath = path.join(assetDirectory, `servers/ripgrep/${getRgExecutableName()}`)
        return {
            lsp: path.join(assetDirectory, 'servers/aws-lsp-codewhisperer.js'),
            node: nodePath,
            ripGrep: rgPath,
            ui: path.join(assetDirectory, 'clients/amazonq-ui.js'),
        }
    }

    protected override downloadMessageOverride: string | undefined = 'Updating Amazon Q plugin'
}
