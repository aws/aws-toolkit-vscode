/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { ResourcePaths } from '../../shared/lsp/types'
import { getNodeExecutableName } from '../../shared/lsp/utils/platform'
import { fs } from '../../shared/fs/fs'
import { BaseLspInstaller } from '../../shared/lsp/baseLspInstaller'
import { getAmazonQWorkspaceLspConfig } from './config'

export class WorkspaceLSPInstaller extends BaseLspInstaller {
    constructor() {
        super(getAmazonQWorkspaceLspConfig(), 'amazonqWorkspaceLsp')
    }

    protected override async postInstall(assetDirectory: string): Promise<void> {
        const resourcePaths = this.resourcePaths(assetDirectory)
        await fs.chmod(resourcePaths.node, 0o755)
    }

    protected override resourcePaths(assetDirectory?: string): ResourcePaths {
        // local version
        if (!assetDirectory) {
            return {
                lsp: this.config.path ?? '',
                node: getNodeExecutableName(),
            }
        }

        const lspNodeName =
            process.platform === 'win32' ? getNodeExecutableName() : `node-${process.platform}-${process.arch}`
        return {
            lsp: path.join(assetDirectory, `qserver-${process.platform}-${process.arch}/qserver/lspServer.js`),
            node: path.join(assetDirectory, lspNodeName),
        }
    }
}
