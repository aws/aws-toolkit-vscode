/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { oneDay } from '../../shared/datetime'
import { getLogger } from '../../shared/logger/logger'
import { AwsLoadCredentials, telemetry } from '../../shared/telemetry/telemetry'
import { withTelemetryContext } from '../../shared/telemetry/util'
import { debounce } from '../../shared/utilities/functionUtils'
import {
    asString,
    CredentialsProvider,
    CredentialsId,
    credentialsProviderToTelemetryType,
    isEqual,
} from './credentials'
import { CredentialsProviderFactory } from './credentialsProviderFactory'

const credentialsProviderManagerClassName = 'CredentialsProviderManager'
/**
 * Responsible for providing the Toolkit with all available CredentialsProviders.
 * Providers may be registered directly or created with supplied CredentialsProviderFactories.
 */
export class CredentialsProviderManager {
    private static INSTANCE: CredentialsProviderManager | undefined
    private readonly providerFactories: CredentialsProviderFactory[] = []
    private readonly providers: CredentialsProvider[] = []

    @withTelemetryContext({ name: 'getAllCredentialsProvider', class: credentialsProviderManagerClassName })
    public async getAllCredentialsProviders(): Promise<CredentialsProvider[]> {
        let providers: CredentialsProvider[] = []

        for (const provider of this.providers) {
            if (await provider.isAvailable()) {
                void this.emitWithDebounce({
                    credentialSourceId: credentialsProviderToTelemetryType(
                        provider.getCredentialsId().credentialSource
                    ),
                    value: 1,
                })
                providers = providers.concat(provider)
            } else {
                getLogger().verbose('auth: "%s" provider unavailable', provider.getCredentialsId().credentialTypeId)
            }
        }

        for (const factory of this.providerFactories) {
            await factory.refresh()
            const refreshed = factory.listProviders()
            const providerType = factory.getProviderType()
            if (!providerType) {
                continue
            }

            void this.emitWithDebounce({
                credentialSourceId: credentialsProviderToTelemetryType(providerType),
                value: refreshed.length,
            })
            providers = providers.concat(refreshed)
        }

        return providers
    }
    private emitWithDebounce = debounce((m: AwsLoadCredentials) => telemetry.aws_loadCredentials.emit(m), oneDay)
    /**
     * Returns a map of `CredentialsProviderId` string-forms to object-forms,
     * from all credential sources. Only available providers are returned.
     */
    @withTelemetryContext({ name: 'getCredentialProviderNames', class: credentialsProviderManagerClassName })
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

        for (const factory of this.providerFactories) {
            await factory.refresh()

            for (const provider of factory.listProviders()) {
                if (isEqual(provider.getCredentialsId(), credentials) && (await provider.isAvailable())) {
                    return provider
                }
            }
        }

        return undefined
    }

    public addProvider(provider: CredentialsProvider) {
        this.removeProvider(provider.getCredentialsId())
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

    public removeProvider(id: CredentialsId) {
        const idx = this.providers.findIndex((p) => isEqual(id, p.getCredentialsId()))
        if (idx !== -1) {
            this.providers.splice(idx, 1)
        }
    }

    public static getInstance(): CredentialsProviderManager {
        if (!CredentialsProviderManager.INSTANCE) {
            CredentialsProviderManager.INSTANCE = new CredentialsProviderManager()
        }

        return CredentialsProviderManager.INSTANCE
    }
}
