/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { CredentialsProvider } from './providers/credentialsProvider'
import { asString, CredentialsProviderId } from './providers/credentialsProviderId'

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
     */
    public async getOrCreateCredentials(
        credentialsProviderId: CredentialsProviderId,
        credentialsProvider: CredentialsProvider
    ): Promise<CachedCredentials> {
        let credentials = await this.getCredentials(credentialsProviderId)

        if (!credentials) {
            credentials = {
                credentials: await credentialsProvider.getCredentials(),
                credentialsHashCode: credentialsProvider.getHashCode()
            }

            this.credentialsCache[asString(credentialsProviderId)] = credentials
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
}
