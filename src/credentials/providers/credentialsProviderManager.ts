/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialProviderChainProvider } from './credentialProviderChainProvider'
import { CredentialsProviderFactory } from './credentialsProviderFactory'
import { makeCredentialsProviderIdComponents } from './credentialsProviderId'

let credentialsProviderManagerInstance: CredentialsProviderManager | undefined

export function getCredentialsProviderManagerInstance(): CredentialsProviderManager {
    if (!credentialsProviderManagerInstance) {
        credentialsProviderManagerInstance = new CredentialsProviderManager()
    }

    return credentialsProviderManagerInstance
}

/**
 * Responsible for providing the Toolkit with all available CredentialsProviders.
 */
export class CredentialsProviderManager {
    private readonly providerFactories: CredentialsProviderFactory[] = []

    public async getAllCredentialsProviders(): Promise<CredentialProviderChainProvider[]> {
        const providers: CredentialProviderChainProvider[] = []

        for (const factory of this.providerFactories) {
            await factory.refresh()

            providers.push(...factory.listProviders())
        }

        return providers
    }

    public async getCredentialsProvider(
        credentialsProviderId: string
    ): Promise<CredentialProviderChainProvider | undefined> {
        const credentialsType = makeCredentialsProviderIdComponents(credentialsProviderId).credentialType

        const factories = this.getFactories(credentialsType)
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

    private getFactories(credentialsType: string) {
        return this.providerFactories.filter(f => f.getCredentialType() === credentialsType)
    }
}
