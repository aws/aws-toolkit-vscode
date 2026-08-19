/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { dirname } from 'path'
import { LspServerProviderI } from './lspServerProvider'
import { CfnLspInstaller } from './lspInstaller'
import { LspInstallationInvalidator } from '../../../shared/lsp/lspLauncher'

export class RemoteLspServerProvider implements LspServerProviderI, LspInstallationInvalidator {
    private installer = new CfnLspInstaller()
    private serverPath?: string

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
        return this.serverPath
    }

    async serverRootDir(): Promise<string> {
        return dirname(await this.serverExecutable())
    }

    async invalidateResolvedInstallation(): Promise<void> {
        this.serverPath = undefined
        await this.installer.invalidateResolvedInstallation()
    }
}
