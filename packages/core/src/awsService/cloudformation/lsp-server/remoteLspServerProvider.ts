/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { dirname } from 'path'
import { LspServerProviderI } from './lspServerProvider'
import { CfnLspInstaller } from './lspInstaller'

export class RemoteLspServerProvider implements LspServerProviderI {
    private installer = new CfnLspInstaller()
    private serverPath?: string

    canProvide(): boolean {
        return true
    }

    async serverExecutable(): Promise<string> {
        if (this.serverPath) {
            return this.serverPath
        }

        const result = await this.installer.resolve()
        this.serverPath = result.resourcePaths.lsp
        return this.serverPath
    }

    async serverRootDir(): Promise<string> {
        return dirname(await this.serverExecutable())
    }
}
