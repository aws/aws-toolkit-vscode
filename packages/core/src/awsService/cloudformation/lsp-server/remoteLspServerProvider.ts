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
    private versionDir?: string

    name(): string {
        return 'RemoteLspServerProvider'
    }

    canProvide(): boolean {
        return true
    }

    async serverExecutable(): Promise<string> {
        if (this.serverPath) {
            return this.serverPath
        }

        const result = await this.installer.resolve()
        this.serverPath = result.resourcePaths.lsp
        this.versionDir = result.assetDirectory
        // Marker is written by CfnLspInstaller (postInstall / fallback) BEFORE cleanup
        return this.serverPath
    }

    async serverRootDir(): Promise<string> {
        return dirname(await this.serverExecutable())
    }

    dispose() {
        if (this.versionDir) {
            this.installer.inUseTracker.removeMarker(this.versionDir)
        }
    }
}
