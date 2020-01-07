/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'

interface CredentialsData {
    credentials: AWS.Credentials
    credentialsHashCode: number
}

/**
 * Simple cache for credentials
 */
export class CredentialsStore {
    private readonly credentialsCache: { [key: string]: CredentialsData }

    public constructor() {
        this.credentialsCache = {}
    }

    /**
     * Returns undefined if credentials are not stored for given ID
     */
    public async getCredentials(credentialsId: string): Promise<AWS.Credentials | undefined> {
        return this.credentialsCache[credentialsId]?.credentials
    }

    /**
     * If credentials are not stored, the provided create function is called. Created credentials are then stored.
     */
    public async getCredentialsOrCreate(
        credentialsId: string,
        createCredentialsFn: (credentialsId: string) => Promise<CredentialsData>
    ): Promise<AWS.Credentials> {
        const credentials = await this.getCredentials(credentialsId)

        if (credentials) {
            return credentials
        }

        const newCredentials = await createCredentialsFn(credentialsId)
        this.credentialsCache[credentialsId] = newCredentials

        return newCredentials.credentials
    }

    /**
     * Returns undefined if credentials are not stored for given ID
     */
    public getCredentialsHashCode(credentialsId: string): number | undefined {
        return this.credentialsCache[credentialsId]?.credentialsHashCode
    }

    /**
     * Evicts credentials from storage
     */
    public invalidateCredentials(credentialsId: string) {
        // tslint:disable-next-line:no-dynamic-delete
        delete this.credentialsCache[credentialsId]
    }
}
