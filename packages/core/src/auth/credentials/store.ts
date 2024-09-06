/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from '@aws-sdk/types'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'
import { asString, CredentialsProvider, CredentialsId } from '../providers/credentials'
import { CredentialsProviderManager } from '../providers/credentialsProviderManager'

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
     * Checks if the stored credentials are valid. Non-existent or expired credentials returns false.
     *
     * If the expiration property does not exist, it is assumed to never expire.
     */
    public isValid(key: string): boolean {
        if (this.credentialsCache[key]) {
            const expiration = this.credentialsCache[key].credentials.expiration
            return expiration !== undefined ? expiration >= new globals.clock.Date() : true
        }

        return false
    }

    /**
     * Returns undefined if the specified credentials are expired or not found.
     */
    public async getCredentials(credentials: CredentialsId): Promise<CachedCredentials | undefined> {
        if (this.isValid(asString(credentials))) {
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
            credentials = await this.consumeProvider(credentialsId, credentialsProvider)
        } else if (credentialsProvider.getHashCode() !== credentials.credentialsHashCode) {
            getLogger().verbose(`Using updated credentials: ${asString(credentialsId)}`)
            this.invalidateCredentials(credentialsId)
            credentials = await this.consumeProvider(credentialsId, credentialsProvider)
        }

        return credentials
    }

    /**
     * Evicts credentials from storage
     */
    public invalidateCredentials(credentialsId: CredentialsId) {
        delete this.credentialsCache[asString(credentialsId)]
    }

    public async setCredentials(credentials: AWS.Credentials, provider: CredentialsProvider): Promise<void> {
        this.credentialsCache[asString(provider.getCredentialsId())] = {
            credentials,
            credentialsHashCode: provider.getHashCode(),
        }
    }

    private async consumeProvider(
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

/**
 * Gets credentials, and tries to refresh them if necessary.
 */
export async function getCredentialsFromStore(
    credentialsId: CredentialsId,
    credentialsStore: CredentialsStore
): Promise<AWS.Credentials | undefined> {
    const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(credentialsId)
    if (!provider) {
        credentialsStore.invalidateCredentials(credentialsId)
        return undefined
    }

    const cachedCredentials = await credentialsStore.upsertCredentials(credentialsId, provider)
    return cachedCredentials.credentials
}
