/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, Logger } from '../../shared/logger/logger'
import { loadSharedCredentialsSections, updateAwsSdkLoadConfigEnvVar } from '../credentials/sharedCredentials'
import { CredentialsProviderType } from './credentials'
import { BaseCredentialsProviderFactory } from './credentialsProviderFactory'
import { SharedCredentialsProvider } from './sharedCredentialsProvider'

export class SharedCredentialsProviderFactory extends BaseCredentialsProviderFactory<SharedCredentialsProvider> {
    private readonly logger: Logger = getLogger()

    public async refresh(): Promise<void> {
        await this.loadSharedCredentialsProviders()
    }

    public override getProviderType(): CredentialsProviderType | undefined {
        return SharedCredentialsProvider.getProviderType()
    }

    private async loadSharedCredentialsProviders(): Promise<void> {
        this.resetProviders()

        const result = await loadSharedCredentialsSections()
        if (result.errors.length > 0) {
            const errors = result.errors.map((e) => e.message).join('\t\n')
            getLogger().warn(`credentials: errors while parsing:\n%s`, errors)
        }
        await updateAwsSdkLoadConfigEnvVar()

        getLogger().verbose(
            `credentials: found sections: ${result.sections.map((s) => `${s.type}:${s.name}`).join(' ')}`
        )
        for (const section of result.sections) {
            if (section.type === 'profile') {
                await this.addProviderIfValid(
                    section.name,
                    new SharedCredentialsProvider(section.name, result.sections)
                )
            }
        }
    }

    private async addProviderIfValid(profileName: string, provider: SharedCredentialsProvider): Promise<void> {
        if (!(await provider.isAvailable())) {
            this.logger.warn(
                `Shared Credentials Profile ${profileName} is not valid. It will not be used by the toolkit.`
            )
        } else {
            this.addProvider(provider)
        }
    }
}
