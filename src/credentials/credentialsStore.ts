/*!
 * Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { CredentialsProvider } from './providers/credentialsProvider'

export interface CachedCredentials {
    credentials: AWS.Credentials
    credentialsHashCode: number
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
    public async getCredentials(credentialsProfileId: string): Promise<CachedCredentials | undefined> {
        return this.credentialsCache[credentialsProfileId]
    }

    /**
     * If credentials are not stored, the credentialsProvider is used to produce credentials (which are then stored).
     */
    public async getOrCreateCredentials(
        credentialsProfileId: string,
        credentialsProvider: CredentialsProvider
    ): Promise<CachedCredentials> {
        let credentials = await this.getCredentials(credentialsProfileId)

        if (!credentials) {
            credentials = {
                credentials: await credentialsProvider.getCredentials(),
                credentialsHashCode: credentialsProvider.getHashCode()
            }

            this.credentialsCache[credentialsProfileId] = credentials
        }

        return credentials
    }

    /**
     * Evicts credentials from storage
     */
    public invalidateCredentials(credentialsProfileId: string) {
        // tslint:disable-next-line:no-dynamic-delete
        delete this.credentialsCache[credentialsProfileId]
    }
}
