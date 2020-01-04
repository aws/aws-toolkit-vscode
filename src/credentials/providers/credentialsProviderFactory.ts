/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialProviderChainProvider } from './credentialProviderChainProvider'

/**
 * Responsible for producing CredentialProviderChainProviders for a Credential Type
 */
export interface CredentialsProviderFactory {
    getCredentialType(): string
    listProviders(): CredentialProviderChainProvider[]
    getProvider(credentialsProviderId: string): CredentialProviderChainProvider | undefined
    refresh(): Promise<void>
}

export abstract class BaseCredentialsProviderFactory<T extends CredentialProviderChainProvider>
    implements CredentialsProviderFactory {
    protected providers: T[] = []
    public abstract getCredentialType(): string

    public listProviders(): T[] {
        return [...this.providers]
    }

    public getProvider(credentialsProviderId: string): CredentialProviderChainProvider | undefined {
        for (const provider of this.providers) {
            if (provider.getCredentialsProviderId() === credentialsProviderId) {
                return provider
            }
        }

        return undefined
    }

    public abstract async refresh(): Promise<void>

    protected addProvider(provider: T) {
        this.providers.push(provider)
    }

    protected removeProvider(provider: T) {
        this.providers = this.providers.filter(x => x !== provider)
    }

    protected resetProviders() {
        this.providers = []
    }
}
