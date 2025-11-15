/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable } from 'vscode'
import { getLogger } from '../../../shared/logger/logger'

export interface LspServerResolverI {
    serverExecutable(): Promise<string>
    serverRootDir(): Promise<string>
}

export interface LspServerProviderI extends LspServerResolverI {
    canProvide(): boolean
}

export class LspServerProvider implements LspServerResolverI, Disposable {
    private readonly matchedProviders: LspServerProviderI[]
    private _serverExecutable?: string
    private _serverRootDir?: string

    constructor(providers: LspServerProviderI[]) {
        const matches = providers.filter((provider) => provider.canProvide())

        if (matches.length < 1) {
            throw new Error(`Matched with 0 CloudFormation LSP providers`)
        }

        this.matchedProviders = matches
        getLogger().info(
            `Found CloudFormation LSP provider: ${this.matchedProviders.map((provider) => provider.constructor.name)}`
        )
    }

    async serverExecutable(): Promise<string> {
        await this.evaluateProviders()
        return this._serverExecutable!
    }

    async serverRootDir(): Promise<string> {
        await this.evaluateProviders()
        return this._serverRootDir!
    }

    private async evaluateProviders() {
        if (this._serverExecutable && this._serverRootDir) {
            return
        }

        for (const provider of this.matchedProviders) {
            try {
                const executable = await provider.serverExecutable()
                const dir = await provider.serverRootDir()

                this._serverExecutable = executable
                this._serverRootDir = dir
                return
            } catch (err) {
                getLogger().error(`Failed to resolve CloudFormation LSP provider ${provider.constructor.name}`, err)
            }
        }
    }

    dispose() {}
}
