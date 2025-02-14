/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fs, getNodeExecutableName, BaseLspInstaller, ResourcePaths } from 'aws-core-vscode/shared'
import path from 'path'
import { getAmazonQLspConfig } from './config'

export class AmazonQLSPInstaller extends BaseLspInstaller {
    constructor() {
        super(getAmazonQLspConfig())
    }

    protected override async postInstall(assetDirectory: string): Promise<void> {
        const resourcePaths = this.resourcePaths(assetDirectory)
        await fs.chmod(resourcePaths.node, 0o755)
    }

    protected override resourcePaths(assetDirectory?: string): ResourcePaths {
        if (!assetDirectory) {
            return {
                lsp: this.config.locationOverride ?? '',
                node: getNodeExecutableName(),
            }
        }

        const nodePath = path.join(assetDirectory, `servers/${getNodeExecutableName()}`)
        return {
            lsp: path.join(assetDirectory, 'servers/aws-lsp-codewhisperer.js'),
            node: nodePath,
        }
    }
}
