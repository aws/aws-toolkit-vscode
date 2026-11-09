/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3Client } from './s3Client'
import { SQLWorkbenchClient } from './sqlWorkbenchClient'
import { GlueClient } from './glueClient'
import { GlueCatalogClient } from './glueCatalogClient'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'
import { ClientType } from '../../explorer/nodes/types'
import { S3ControlClient } from '@aws-sdk/client-s3-control'
import { getLogger } from '../../../shared/logger/logger'

/**
 * Client store for managing service clients per connection
 */
export class ConnectionClientStore {
    private static instance: ConnectionClientStore
    private clientCache: Record<string, Record<string, any>> = {}

    private constructor() {}

    public static getInstance(): ConnectionClientStore {
        if (!ConnectionClientStore.instance) {
            ConnectionClientStore.instance = new ConnectionClientStore()
        }
        return ConnectionClientStore.instance
    }

    /**
     * Gets or creates a client for a specific connection
     */
    public getClient<T>(connectionId: string, clientType: string, factory: () => T): T {
        if (!this.clientCache[connectionId]) {
            this.clientCache[connectionId] = {}
        }

        if (!this.clientCache[connectionId][clientType]) {
            this.clientCache[connectionId][clientType] = factory()
        }

        return this.clientCache[connectionId][clientType]
    }

    /**
     * Gets or creates an S3Client for a connection
     */
    public getS3Client(
        connectionId: string,
        region: string,
        connectionCredentialsProvider: ConnectionCredentialsProvider
    ): S3Client {
        return this.getClient(
            connectionId,
            ClientType.S3Client,
            () => new S3Client(region, connectionCredentialsProvider)
        )
    }

    /**
     * Gets or creates a SQLWorkbenchClient for a connection
     */
    public getSQLWorkbenchClient(
        connectionId: string,
        region: string,
        connectionCredentialsProvider: ConnectionCredentialsProvider
    ): SQLWorkbenchClient {
        return this.getClient(connectionId, ClientType.SQLWorkbenchClient, () =>
            SQLWorkbenchClient.createWithCredentials(region, connectionCredentialsProvider)
        )
    }

    /**
     * Gets or creates a GlueClient for a connection
     */
    public getGlueClient(
        connectionId: string,
        region: string,
        connectionCredentialsProvider: ConnectionCredentialsProvider
    ): GlueClient {
        return this.getClient(
            connectionId,
            ClientType.GlueClient,
            () => new GlueClient(region, connectionCredentialsProvider)
        )
    }

    /**
     * Gets or creates a GlueCatalogClient for a connection
     */
    public getGlueCatalogClient(
        connectionId: string,
        region: string,
        connectionCredentialsProvider: ConnectionCredentialsProvider
    ): GlueCatalogClient {
        return this.getClient(connectionId, ClientType.GlueCatalogClient, () =>
            GlueCatalogClient.createWithCredentials(region, connectionCredentialsProvider)
        )
    }

    /**
     * Gets or creates an S3ControlClient for a connection
     */
    public getS3ControlClient(
        connectionId: string,
        region: string,
        connectionCredentialsProvider: ConnectionCredentialsProvider
    ): S3ControlClient {
        return this.getClient(connectionId, ClientType.S3ControlClient, () => {
            const credentialsProvider = async () => {
                const credentials = await connectionCredentialsProvider.getCredentials()
                return {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken,
                    expiration: credentials.expiration,
                }
            }
            return new S3ControlClient({ region, credentials: credentialsProvider })
        })
    }

    /**
     * Clears all cached clients for a connection
     */
    public clearConnection(connectionId: string): void {
        delete this.clientCache[connectionId]
    }

    /**
     * Clears all cached clients
     */
    public clearAll(): void {
        getLogger('smus').info('SMUS Connection: Clearing all cached clients')
        this.clientCache = {}
    }
}
