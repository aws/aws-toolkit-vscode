/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import { getLogger, Logger } from '../../shared/logger'
import {
    getConfigFilename,
    getCredentialsFilename,
    loadSharedCredentialsProfiles,
    updateAwsSdkLoadConfigEnvironmentVariable
} from '../sharedCredentials'
import { BaseCredentialsProviderFactory } from './credentialsProviderFactory'
import { SharedCredentialsProvider } from './sharedCredentialsProvider'

export class SharedCredentialsProviderFactory extends BaseCredentialsProviderFactory<SharedCredentialsProvider> {
    private readonly logger: Logger = getLogger()

    private loadedCredentialsModificationDate?: number
    private loadedConfigModificationDate?: number

    public getCredentialType(): string {
        return SharedCredentialsProvider.getCredentialsType()
    }

    public async refresh(): Promise<void> {
        if (await this.needsRefresh()) {
            await this.loadSharedCredentialsProviders()
        }
    }

    protected resetProviders() {
        this.loadedCredentialsModificationDate = undefined
        this.loadedConfigModificationDate = undefined

        super.resetProviders()
    }

    private async needsRefresh(): Promise<boolean> {
        const credentialsLastMod = await this.getLastModifiedTime(getCredentialsFilename())
        const configLastMod = await this.getLastModifiedTime(getConfigFilename())

        return (
            this.loadedCredentialsModificationDate !== credentialsLastMod ||
            this.loadedConfigModificationDate !== configLastMod
        )
    }

    private async loadSharedCredentialsProviders(): Promise<void> {
        this.resetProviders()

        this.logger.verbose('Loading all Shared Credentials Profiles')
        const allCredentialProfiles = await loadSharedCredentialsProfiles()
        this.loadedCredentialsModificationDate = await this.getLastModifiedTime(getCredentialsFilename())
        this.loadedConfigModificationDate = await this.getLastModifiedTime(getConfigFilename())
        await updateAwsSdkLoadConfigEnvironmentVariable()

        for (const profileName of allCredentialProfiles.keys()) {
            const provider = new SharedCredentialsProvider(profileName, allCredentialProfiles)
            await this.addProviderIfValid(profileName, provider)
        }
    }

    private async addProviderIfValid(profileName: string, provider: SharedCredentialsProvider): Promise<void> {
        const validationMessage = provider.validate()
        if (validationMessage) {
            this.logger.warn(
                `Shared Credentials Profile ${profileName} is not valid. It will not be used by the toolkit. ${validationMessage}`
            )
        } else {
            this.addProvider(provider)
        }
    }

    private async getLastModifiedTime(filepath: string): Promise<number | undefined> {
        try {
            const stat = await fs.stat(filepath)

            return stat.mtimeMs
        } catch (err) {
            return undefined
        }
    }
}
