/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { dirname } from 'path'
import { LspServerProviderI } from './lspServerProvider'
import { CfnLspInstaller } from './lspInstaller'
import { LspInstallationInvalidator } from '../../../shared/lsp/lspLauncher'

export class RemoteLspServerProvider implements LspServerProviderI, LspInstallationInvalidator {
    private installer?: CfnLspInstaller
    private serverPath?: string

    constructor(private readonly createInstaller: () => CfnLspInstaller = () => new CfnLspInstaller()) {}

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

        const installer = this.getInstaller()
        const result = await installer.resolve()
        await installer.cleanupAfterResolveWithLegacy()
        this.serverPath = result.resourcePaths.lsp
        return this.serverPath
    }

    async serverRootDir(): Promise<string> {
        return dirname(await this.serverExecutable())
    }

    async invalidateResolvedInstallation(): Promise<void> {
        this.serverPath = undefined
        await this.installer?.invalidateResolvedInstallation()
    }

    /**
     * Created on first use so that a failure to locate the cache directory surfaces as a provider
     * resolution error instead of failing construction of the provider chain.
     */
    private getInstaller(): CfnLspInstaller {
        this.installer ??= this.createInstaller()
        return this.installer
    }
}
