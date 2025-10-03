/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Glue,
    GetDatabasesCommand,
    GetTablesCommand,
    GetTableCommand,
    Table,
    ResourceShareType,
    DatabaseAttributes,
    TableAttributes,
    Database,
} from '@aws-sdk/client-glue'
import { getLogger } from '../../../shared/logger/logger'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'

/**
 * Client for interacting with AWS Glue API using public SDK
 */
export class GlueClient {
    private glueClient: Glue | undefined
    private readonly logger = getLogger()

    constructor(
        private readonly region: string,
        private readonly connectionCredentialsProvider: ConnectionCredentialsProvider
    ) {}

    /**
     * Gets databases from a catalog
     * @param catalogId Optional catalog ID (uses default if not provided)
     * @param nextToken Optional pagination token
     * @returns List of databases
     */
    public async getDatabases(
        catalogId?: string,
        resourceShareType?: ResourceShareType,
        attributesToGet?: DatabaseAttributes[],
        nextToken?: string
    ): Promise<{ databases: Database[]; nextToken?: string }> {
        try {
            this.logger.info(`GlueClient: Getting databases for catalog ${catalogId || 'default'}`)

            const glueClient = await this.getGlueClient()
            const response = await glueClient.send(
                new GetDatabasesCommand({
                    CatalogId: catalogId,
                    ResourceShareType: resourceShareType,
                    AttributesToGet: attributesToGet,
                    NextToken: nextToken,
                    MaxResults: 100,
                })
            )

            const databases = response.DatabaseList || []
            this.logger.info(`GlueClient: Found ${databases.length} databases`)

            return {
                databases,
                nextToken: response.NextToken,
            }
        } catch (err) {
            this.logger.error('GlueClient: Failed to get databases: %s', err as Error)
            throw err
        }
    }

    /**
     * Gets tables from a database
     * @param databaseName Database name
     * @param catalogId Optional catalog ID
     * @param nextToken Optional pagination token
     * @returns List of tables
     */
    public async getTables(
        databaseName: string,
        catalogId?: string,
        attributesToGet?: TableAttributes[],
        nextToken?: string
    ): Promise<{ tables: Table[]; nextToken?: string }> {
        try {
            this.logger.info(`GlueClient: Getting tables for database ${databaseName}`)

            const glueClient = await this.getGlueClient()
            const response = await glueClient.send(
                new GetTablesCommand({
                    DatabaseName: databaseName,
                    CatalogId: catalogId,
                    AttributesToGet: attributesToGet,
                    NextToken: nextToken,
                    MaxResults: 100,
                })
            )

            const tables = response.TableList || []
            this.logger.info(`GlueClient: Found ${tables.length} tables`)

            return {
                tables,
                nextToken: response.NextToken,
            }
        } catch (err) {
            this.logger.error('GlueClient: Failed to get tables: %s', err as Error)
            throw err
        }
    }

    /**
     * Gets table details including columns
     * @param databaseName Database name
     * @param tableName Table name
     * @param catalogId Optional catalog ID
     * @returns Table details with columns
     */
    public async getTable(databaseName: string, tableName: string, catalogId?: string): Promise<Table | undefined> {
        try {
            this.logger.info(`GlueClient: Getting table ${tableName} from database ${databaseName}`)

            const glueClient = await this.getGlueClient()
            const response = await glueClient.send(
                new GetTableCommand({
                    DatabaseName: databaseName,
                    Name: tableName,
                    CatalogId: catalogId,
                })
            )

            return response.Table
        } catch (err) {
            this.logger.error('GlueClient: Failed to get table: %s', err as Error)
            throw err
        }
    }

    /**
     * Gets the Glue client, initializing it if necessary
     */
    private async getGlueClient(): Promise<Glue> {
        if (!this.glueClient) {
            try {
                const credentialsProvider = async () => {
                    const credentials = await this.connectionCredentialsProvider.getCredentials()
                    return {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken,
                        expiration: credentials.expiration,
                    }
                }

                this.glueClient = new Glue({
                    region: this.region,
                    credentials: credentialsProvider,
                })
                this.logger.debug('GlueClient: Successfully created Glue client')
            } catch (err) {
                this.logger.error('GlueClient: Failed to create Glue client: %s', err as Error)
                throw err
            }
        }
        return this.glueClient
    }
}
