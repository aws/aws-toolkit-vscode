/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialsProvider } from './credentialsProvider'
import { CredentialsProviderId, isEqual } from './credentialsProviderId'

/**
 * Responsible for producing CredentialsProvider objects for a Credential Type
 */
export interface CredentialsProviderFactory {
    getCredentialType(): string
    listProviders(): CredentialsProvider[]
    getProvider(credentialsProviderId: CredentialsProviderId): CredentialsProvider | undefined
    refresh(): Promise<void>
}

export abstract class BaseCredentialsProviderFactory<T extends CredentialsProvider>
    implements CredentialsProviderFactory {
    protected providers: T[] = []
    public abstract getCredentialType(): string

    public listProviders(): T[] {
        return [...this.providers]
    }

    public getProvider(credentialsProviderId: CredentialsProviderId): CredentialsProvider | undefined {
        for (const provider of this.providers) {
            if (isEqual(provider.getCredentialsProviderId(), credentialsProviderId)) {
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
