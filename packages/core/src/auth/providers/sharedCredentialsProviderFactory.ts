/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, Logger } from '../../shared/logger/logger'
import { loadSharedCredentialsSections, updateAwsSdkLoadConfigEnvVar } from '../credentials/sharedCredentials'
import { CredentialsId, CredentialsProviderType } from './credentials'
import { BaseCredentialsProviderFactory } from './credentialsProviderFactory'
import { SharedCredentialsProvider } from './sharedCredentialsProvider'

export class SharedCredentialsProviderFactory extends BaseCredentialsProviderFactory<SharedCredentialsProvider> {
    private readonly logger: Logger = getLogger()
    private reloading: Promise<void> | undefined
    private providersByName = new Map<string, SharedCredentialsProvider>()

    public async refresh(): Promise<void> {
        // A running reload may have read the files before this call changed them.
        const previous = this.reloading
        await previous?.catch(() => undefined)
        // Another caller waiting on `previous` may have started the next reload already.
        if (this.reloading === previous) {
            this.reloading = this.loadSharedCredentialsProviders()
        }
        await this.reloading
    }

    public override getProviderType(): CredentialsProviderType | undefined {
        return SharedCredentialsProvider.getProviderType()
    }

    // `listConnections()` looks up every profile at once.
    public override getProvider(credentials: CredentialsId): SharedCredentialsProvider | undefined {
        return credentials.credentialSource === SharedCredentialsProvider.getProviderType()
            ? this.providersByName.get(credentials.credentialTypeId)
            : undefined
    }

    private async loadSharedCredentialsProviders(): Promise<void> {
        const result = await loadSharedCredentialsSections()
        if (result.errors.length > 0) {
            const errors = result.errors.map((e) => e.message).join('\t\n')
            getLogger().warn(`credentials: errors while parsing:\n%s`, errors)
        }
        await updateAwsSdkLoadConfigEnvVar()

        getLogger().verbose(
            `credentials: found sections: ${result.sections.map((s) => `${s.type}:${s.name}`).join(' ')}`
        )
        const providers: SharedCredentialsProvider[] = []
        for (const section of result.sections) {
            if (section.type === 'profile') {
                await this.addProviderIfValid(
                    providers,
                    section.name,
                    new SharedCredentialsProvider(section.name, result.sections, section)
                )
            }
        }
        // Swap in one step: a partial list makes the profile store drop profiles.
        this.providers = providers
        this.providersByName = new Map(providers.map((p) => [p.getCredentialsId().credentialTypeId, p]))
    }

    private async addProviderIfValid(
        providers: SharedCredentialsProvider[],
        profileName: string,
        provider: SharedCredentialsProvider
    ): Promise<void> {
        if (!(await provider.isAvailable())) {
            this.logger.warn(
                `Shared Credentials Profile ${profileName} is not valid. It will not be used by the toolkit.`
            )
        } else {
            providers.push(provider)
        }
    }
}
