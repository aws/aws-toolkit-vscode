/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { recordAwsLoadCredentials } from '../../shared/telemetry/telemetry'
import { asString, CredentialsProvider, CredentialsId, credentialsProviderToTelemetryType, CredentialsProviderType } from './credentials'
import { CredentialsProviderFactory } from './credentialsProviderFactory'

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
            const refreshed = factory.listProviders()
            const providerType = factory.getProviderType()
            if (!providerType) {
                continue
            }
            const telemType = credentialsProviderToTelemetryType(providerType)
            recordAwsLoadCredentials({ credentialSourceId: telemType, value: refreshed.length })
            providers = providers.concat(refreshed)
        }

        return providers
    }

    /**
     * Returns a map of `CredentialsProviderId` string-forms to object-forms,
     * from all credential sources.
     */
    public async getCredentialProviderNames(): Promise<{ [key: string]: CredentialsId }> {
        const m: { [key: string]: CredentialsId } = {}
        for (const o of await this.getAllCredentialsProviders()) {
            m[asString(o.getCredentialsId())] = o.getCredentialsId()
        }

        return m
    }

    public async getCredentialsProvider(
        credentials: CredentialsId
    ): Promise<CredentialsProvider | undefined> {
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

    public addProviderFactory(factory: CredentialsProviderFactory) {
        this.providerFactories.push(factory)
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
