/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { getLogger } from '../shared/logger/logger'
import { CredentialsProvider } from './providers/credentialsProvider'
import { asString, CredentialsProviderId } from './providers/credentialsProviderId'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'

export interface CachedCredentials {
    credentials: AWS.Credentials
    credentialsHashCode: string
}

/**
 * Simple cache for credentials
 */
export class CredentialsStore {
    private readonly credentialsCache: { [key: string]: CachedCredentials }

    public constructor() {
        this.credentialsCache = {}
    }

    /**
     * Returns undefined if credentials are not stored for given ID
     */
    public async getCredentials(credentialsProviderId: CredentialsProviderId): Promise<CachedCredentials | undefined> {
        return this.credentialsCache[asString(credentialsProviderId)]
    }

    /**
     * If credentials are not stored, the credentialsProvider is used to produce credentials (which are then stored).
     * If the credentials exist but are outdated, the credentials will be invalidated and updated.
     * Either way, the credentials tied to the credentialsProviderId will then be returned.
     */
    public async upsertCredentials(
        credentialsProviderId: CredentialsProviderId,
        credentialsProvider: CredentialsProvider
    ): Promise<CachedCredentials> {
        let credentials = await this.getCredentials(credentialsProviderId)

        if (!credentials) {
            credentials = await this.setCredentials(credentialsProviderId, credentialsProvider)
        } else if (credentialsProvider.getHashCode() !== credentials.credentialsHashCode) {
            getLogger().verbose(`Using updated credentials: ${asString(credentialsProviderId)}`)
            this.invalidateCredentials(credentialsProviderId)
            credentials = await this.setCredentials(credentialsProviderId, credentialsProvider)
        }

        return credentials
    }

    /**
     * Evicts credentials from storage
     */
    public invalidateCredentials(credentialsProviderId: CredentialsProviderId) {
        // tslint:disable-next-line:no-dynamic-delete
        delete this.credentialsCache[asString(credentialsProviderId)]
    }

    private async setCredentials(
        credentialsProviderId: CredentialsProviderId,
        credentialsProvider: CredentialsProvider
    ): Promise<CachedCredentials> {
        const credentials = {
            credentials: await credentialsProvider.getCredentials(),
            credentialsHashCode: credentialsProvider.getHashCode(),
        }

        this.credentialsCache[asString(credentialsProviderId)] = credentials

        return credentials
    }
}

export async function getCredentialsFromStore(
    credentialsProviderId: CredentialsProviderId,
    credentialsStore: CredentialsStore
): Promise<AWS.Credentials> {
    const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(credentialsProviderId)
    if (!provider) {
        credentialsStore.invalidateCredentials(credentialsProviderId)
        throw new Error(`Could not find Credentials Provider for ${asString(credentialsProviderId)}`)
    }

    const cachedCredentials = await credentialsStore.upsertCredentials(credentialsProviderId, provider)
    return cachedCredentials.credentials
}
