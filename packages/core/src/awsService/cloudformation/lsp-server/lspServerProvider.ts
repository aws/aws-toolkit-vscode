/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable } from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'
import { LspInstallationInvalidator } from '../../../shared/lsp/lspLauncher'

export interface LspServerResolverI {
    serverExecutable(): Promise<string>
    serverRootDir(): Promise<string>
}

export interface LspServerProviderI extends LspServerResolverI {
    canProvide(): boolean
    name(): string
}

export class LspServerProvider implements LspServerResolverI, LspInstallationInvalidator, Disposable {
    private readonly matchedProviders: LspServerProviderI[]
    private _serverExecutable?: string
    private _serverRootDir?: string

    constructor(providers: LspServerProviderI[]) {
        const matches = providers.filter((provider) => provider.canProvide())

        if (matches.length < 1) {
            throw new Error(`Matched with 0 CloudFormation LSP providers`)
        }

        this.matchedProviders = matches
        getLogger('awsCfnLsp').info(
            `Found CloudFormation LSP provider: ${this.matchedProviders.map((provider) => provider.name())}`
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

    /**
     * Invalidates cached resolution and propagates to providers that support it.
     */
    async invalidateResolvedInstallation(): Promise<void> {
        this._serverExecutable = undefined
        this._serverRootDir = undefined

        for (const provider of this.matchedProviders) {
            if ('invalidateResolvedInstallation' in provider) {
                await (provider as LspInstallationInvalidator).invalidateResolvedInstallation()
            }
        }
    }

    private async evaluateProviders(): Promise<void> {
        if (this._serverExecutable && this._serverRootDir) {
            return
        }

        const errors: Array<{ provider: string; error: unknown }> = []

        for (const provider of this.matchedProviders) {
            try {
                const executable = await provider.serverExecutable()
                const dir = await provider.serverRootDir()

                this._serverExecutable = executable
                this._serverRootDir = dir
                return
            } catch (err) {
                getLogger('awsCfnLsp').error(
                    ToolkitError.chain(err, `Failed to resolve CloudFormation LSP provider ${provider.name()}`)
                )
                errors.push({ provider: provider.name(), error: err })
            }
        }

        // All providers failed — throw instead of leaving undefined state
        const providerNames = errors.map((e) => e.provider).join(', ')
        throw new ToolkitError(`All CloudFormation LSP providers failed: [${providerNames}]`, {
            code: 'AllProvidersFailed',
            cause: errors[errors.length - 1]?.error as Error,
        })
    }

    dispose() {}
}
