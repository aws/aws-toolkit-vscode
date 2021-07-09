/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { recordAwsLoadCredentials } from '../../shared/telemetry/telemetry'
import {
    asString,
    CredentialsProvider,
    CredentialsId,
    credentialsProviderToTelemetryType,
    CredentialsProviderType,
    isEqual,
} from './credentials'
import { CredentialsProviderFactory } from './credentialsProviderFactory'

/**
 * Responsible for providing the Toolkit with all available CredentialsProviders.
 * Providers may be registered directly or created with supplied CredentialsProviderFactories.
 */
export class CredentialsProviderManager {
    private static INSTANCE: CredentialsProviderManager | undefined
    private readonly providerFactories: CredentialsProviderFactory[] = []
    private readonly providers: CredentialsProvider[] = []

    public async getAllCredentialsProviders(): Promise<CredentialsProvider[]> {
        let providers: CredentialsProvider[] = []

        for (const provider of this.providers) {
            if (await provider.isAvailable()) {
                const telemType = credentialsProviderToTelemetryType(provider.getCredentialsId().credentialSource)
                recordAwsLoadCredentials({ credentialSourceId: telemType, value: 1 })
                providers = providers.concat(provider)
            } else {
                getLogger().verbose(
                    `provider for ${provider.getCredentialsId().credentialTypeId} unavailable in this environment`
                )
            }
        }

        for (const factory of this.providerFactories) {
            await factory.refresh()
            const refreshed = factory.listProviders()
            const providerType = factory.getProviderType()
            if (!providerType) {
                continue
            }
            const telemType = credentialsProviderToTelemetryType(providerType)
            recordAwsLoadCredentials({ credentialSourceId: telemType, value: refreshed.length })
            providers = providers.concat(refreshed)
        }

        getLogger().verbose(`available credentials providers: ${providers}`)
        return providers
    }

    /**
     * Returns a map of `CredentialsProviderId` string-forms to object-forms,
     * from all credential sources. Only available providers are returned.
     */
    public async getCredentialProviderNames(): Promise<{ [key: string]: CredentialsId }> {
        const m: { [key: string]: CredentialsId } = {}
        for (const o of await this.getAllCredentialsProviders()) {
            m[asString(o.getCredentialsId())] = o.getCredentialsId()
        }

        return m
    }

    public async getCredentialsProvider(credentials: CredentialsId): Promise<CredentialsProvider | undefined> {
        for (const provider of this.providers) {
            if (isEqual(provider.getCredentialsId(), credentials) && (await provider.isAvailable())) {
                return provider
            }
        }

        const factories = this.getFactories(credentials.credentialSource)
        for (const factory of factories) {
            await factory.refresh()

            const provider = factory.getProvider(credentials)
            if (provider) {
                return provider
            }
        }

        return undefined
    }

    public addProvider(provider: CredentialsProvider) {
        this.providers.push(provider)
    }

    public addProviders(...provider: CredentialsProvider[]) {
        this.providers.push(...provider)
    }

    public addProviderFactory(factory: CredentialsProviderFactory) {
        this.providerFactories.push(factory)
    }

    public addProviderFactories(...factory: CredentialsProviderFactory[]) {
        this.providerFactories.push(...factory)
    }

    private getFactories(credentialsType: CredentialsProviderType): CredentialsProviderFactory[] {
        return this.providerFactories.filter(f => f.getProviderType() === credentialsType)
    }

    public static getInstance(): CredentialsProviderManager {
        if (!CredentialsProviderManager.INSTANCE) {
            CredentialsProviderManager.INSTANCE = new CredentialsProviderManager()
        }

        return CredentialsProviderManager.INSTANCE
    }
}
