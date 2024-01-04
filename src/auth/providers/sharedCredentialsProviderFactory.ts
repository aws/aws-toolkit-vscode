/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fsCommon } from '../../srcShared/fs'
import { getLogger, Logger } from '../../shared/logger'
import { loadSharedCredentialsSections, updateAwsSdkLoadConfigEnvVar } from '../credentials/sharedCredentials'
import { CredentialsProviderType } from './credentials'
import { BaseCredentialsProviderFactory } from './credentialsProviderFactory'
import { SharedCredentialsProvider } from './sharedCredentialsProvider'
import { getCredentialsFilename, getConfigFilename } from '../credentials/sharedCredentialsFile'

export class SharedCredentialsProviderFactory extends BaseCredentialsProviderFactory<SharedCredentialsProvider> {
    private readonly logger: Logger = getLogger()

    private loadedCredentialsModificationMillis?: number
    private loadedConfigModificationMillis?: number

    public async refresh(): Promise<void> {
        if (await this.needsRefresh()) {
            await this.loadSharedCredentialsProviders()
        }
    }

    public override getProviderType(): CredentialsProviderType | undefined {
        return SharedCredentialsProvider.getProviderType()
    }

    protected override resetProviders() {
        this.loadedCredentialsModificationMillis = undefined
        this.loadedConfigModificationMillis = undefined

        super.resetProviders()
    }

    private async needsRefresh(): Promise<boolean> {
        const credentialsLastModMillis = await this.getLastModifiedMillis(getCredentialsFilename())
        const configLastModMillis = await this.getLastModifiedMillis(getConfigFilename())

        return (
            this.loadedCredentialsModificationMillis !== credentialsLastModMillis ||
            this.loadedConfigModificationMillis !== configLastModMillis
        )
    }

    private async loadSharedCredentialsProviders(): Promise<void> {
        this.resetProviders()

        const result = await loadSharedCredentialsSections()
        if (result.errors.length > 0) {
            const errors = result.errors.map(e => e.message).join('\t\n')
            getLogger().warn(`credentials: errors while parsing:\n%s`, errors)
        }

        this.loadedCredentialsModificationMillis = await this.getLastModifiedMillis(getCredentialsFilename())
        this.loadedConfigModificationMillis = await this.getLastModifiedMillis(getConfigFilename())
        await updateAwsSdkLoadConfigEnvVar()

        getLogger().verbose(`credentials: found sections: ${result.sections.map(s => `${s.type}:${s.name}`).join(' ')}`)
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

    private async getLastModifiedMillis(filepath: string): Promise<number | undefined> {
        try {
            const stat = await fsCommon.stat(filepath)

            if (stat === undefined) {
                throw new Error(`Cannot get stat() of ${filepath}`)
            }

            return stat.mtime
        } catch (err) {
            return undefined
        }
    }
}
