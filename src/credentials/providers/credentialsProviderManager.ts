/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialsProvider } from './credentialsProvider'
import { CredentialsProviderFactory } from './credentialsProviderFactory'
import { CredentialsProviderId } from './credentialsProviderId'

/**
 * Responsible for providing the Toolkit with all available CredentialsProviders.
 */
export class CredentialsProviderManager {
    private static INSTANCE: CredentialsProviderManager | undefined
    private readonly providerFactories: CredentialsProviderFactory[] = []

    public async getAllCredentialsProviders(): Promise<CredentialsProvider[]> {
        let providers: CredentialsProvider[] = []

        for (const factory of this.providerFactories) {
            await factory.refresh()

            providers = providers.concat(factory.listProviders())
        }

        return providers
    }

    public async getCredentialsProvider(
        credentialsProviderId: CredentialsProviderId
    ): Promise<CredentialsProvider | undefined> {
        const factories = this.getFactories(credentialsProviderId.credentialType)
        for (const factory of factories) {
            await factory.refresh()

            const provider = factory.getProvider(credentialsProviderId)
            if (provider) {
                return provider
            }
        }

        return undefined
    }

    public addProviderFactory(factory: CredentialsProviderFactory) {
        this.providerFactories.push(factory)
    }

    private getFactories(credentialsType: string): CredentialsProviderFactory[] {
        return this.providerFactories.filter(f => f.getCredentialType() === credentialsType)
    }

    public static getInstance(): CredentialsProviderManager {
        if (!CredentialsProviderManager.INSTANCE) {
            CredentialsProviderManager.INSTANCE = new CredentialsProviderManager()
        }

        return CredentialsProviderManager.INSTANCE
    }
}
