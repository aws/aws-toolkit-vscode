/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fs, getNodeExecutableName, BaseLspInstaller, ResourcePaths } from 'aws-core-vscode/shared'
import path from 'path'
import { getAmazonQLspConfig } from './config'
import { LspConfig } from 'aws-core-vscode/amazonq'

export interface AmazonQResourcePaths extends ResourcePaths {
    mynahUI: string
}

export class AmazonQLspInstaller extends BaseLspInstaller.BaseLspInstaller<AmazonQResourcePaths> {
    constructor(lspConfig: LspConfig = getAmazonQLspConfig()) {
        super(lspConfig, 'amazonqLsp')
    }

    protected override async postInstall(assetDirectory: string): Promise<void> {
        const resourcePaths = this.resourcePaths(assetDirectory)
        await fs.chmod(resourcePaths.node, 0o755)
    }

    protected override resourcePaths(assetDirectory?: string): AmazonQResourcePaths {
        if (!assetDirectory) {
            return {
                lsp: this.config.path ?? '',
                node: getNodeExecutableName(),
                mynahUI: '', // TODO make mynah UI configurable
            }
        }

        const nodePath = path.join(assetDirectory, `servers/${getNodeExecutableName()}`)
        return {
            lsp: path.join(assetDirectory, 'servers/aws-lsp-codewhisperer.js'),
            node: nodePath,
            mynahUI: path.join(assetDirectory, 'clients/amazonq-ui.js'),
        }
    }
}
