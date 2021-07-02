/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialsProvider, CredentialsProviderType, CredentialsId, isEqual } from './credentials'

/**
 * Responsible for producing CredentialsProvider objects for a Credential Type
 */
export interface CredentialsProviderFactory {
    /**
     * Returns the CredentialsProviderType of the first item in listProviders(), or undefined.
     */
    getProviderType(): CredentialsProviderType | undefined
    listProviders(): CredentialsProvider[]
    getProvider(credentials: CredentialsId): CredentialsProvider | undefined
    refresh(): Promise<void>
}

export abstract class BaseCredentialsProviderFactory<T extends CredentialsProvider>
    implements CredentialsProviderFactory
{
    protected providers: T[] = []

    public getProviderType(): CredentialsProviderType | undefined {
        const ps = this.listProviders()
        if (ps.length === 0) {
            return undefined
        }
        return ps[0].getProviderType()
    }

    public listProviders(): T[] {
        return [...this.providers]
    }

    public getProvider(credentials: CredentialsId): CredentialsProvider | undefined {
        for (const provider of this.providers) {
            if (isEqual(provider.getCredentialsId(), credentials)) {
                return provider
            }
        }

        return undefined
    }

    public abstract refresh(): Promise<void>

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
