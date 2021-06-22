/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { getLogger } from '../shared/logger/logger'
import { asString, CredentialsProvider, CredentialsId } from './providers/credentials'
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
     * Returns undefined if the specified credentials are expired or not found.
     */
    public async getCredentials(credentials: CredentialsId): Promise<CachedCredentials | undefined> {
        if (
            this.credentialsCache[asString(credentials)] &&
            !this.credentialsCache[asString(credentials)].credentials.expired
        ) {
            return this.credentialsCache[asString(credentials)]
        } else {
            return undefined
        }
    }

    /**
     * If credentials are not stored, the credentialsProvider is used to produce credentials (which are then stored).
     * If the credentials exist but are outdated, the credentials will be invalidated and updated.
     * Either way, the credentials tied to the credentialsId will then be returned.
     */
    public async upsertCredentials(
        credentialsId: CredentialsId,
        credentialsProvider: CredentialsProvider
    ): Promise<CachedCredentials> {
        let credentials = await this.getCredentials(credentialsId)

        if (!credentials) {
            credentials = await this.setCredentials(credentialsId, credentialsProvider)
        } else if (credentialsProvider.getHashCode() !== credentials.credentialsHashCode) {
            getLogger().verbose(`Using updated credentials: ${asString(credentialsId)}`)
            this.invalidateCredentials(credentialsId)
            credentials = await this.setCredentials(credentialsId, credentialsProvider)
        }

        return credentials
    }

    /**
     * Evicts credentials from storage
     */
    public invalidateCredentials(credentialsId: CredentialsId) {
        delete this.credentialsCache[asString(credentialsId)]
    }

    private async setCredentials(
        credentialsId: CredentialsId,
        credentialsProvider: CredentialsProvider
    ): Promise<CachedCredentials> {
        const credentials = {
            credentials: await credentialsProvider.getCredentials(),
            credentialsHashCode: credentialsProvider.getHashCode(),
        }

        this.credentialsCache[asString(credentialsId)] = credentials

        return credentials
    }
}

export async function getCredentialsFromStore(
    credentialsId: CredentialsId,
    credentialsStore: CredentialsStore
): Promise<AWS.Credentials> {
    const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(credentialsId)
    if (!provider) {
        credentialsStore.invalidateCredentials(credentialsId)
        throw new Error(`Could not find Credentials Provider for ${asString(credentialsId)}`)
    }

    const cachedCredentials = await credentialsStore.upsertCredentials(credentialsId, provider)
    return cachedCredentials.credentials
}
