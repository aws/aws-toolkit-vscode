/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../../shared/logger/logger'
import { GlueCatalog, Catalog } from '@amzn/glue-catalog-client'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'

/**
 * Client for interacting with Glue Catalog API
 */
export class GlueCatalogClient {
    private glueClient: GlueCatalog | undefined
    private static instance: GlueCatalogClient | undefined
    private readonly logger = getLogger('smus')

    private constructor(
        private readonly region: string,
        private readonly connectionCredentialsProvider?: ConnectionCredentialsProvider
    ) {}

    /**
     * Gets a singleton instance of the GlueCatalogClient
     * @returns GlueCatalogClient instance
     */
    public static getInstance(region: string): GlueCatalogClient {
        if (!GlueCatalogClient.instance) {
            GlueCatalogClient.instance = new GlueCatalogClient(region)
        }
        return GlueCatalogClient.instance
    }

    /**
     * Creates a new GlueCatalogClient instance with specific credentials
     * @param region AWS region
     * @param credentials AWS credentials
     * @returns GlueCatalogClient instance with credentials
     */
    public static createWithCredentials(
        region: string,
        connectionCredentialsProvider: ConnectionCredentialsProvider
    ): GlueCatalogClient {
        return new GlueCatalogClient(region, connectionCredentialsProvider)
    }

    /**
     * Gets the AWS region
     * @returns AWS region
     */
    public getRegion(): string {
        return this.region
    }

    /**
     * Lists Glue catalogs with pagination support
     * @param nextToken Optional pagination token
     * @returns Object containing catalogs and nextToken
     */
    public async getCatalogs(nextToken?: string): Promise<{ catalogs: Catalog[]; nextToken?: string }> {
        try {
            this.logger.info(`GlueCatalogClient: Getting catalogs in region ${this.region}`)

            const glueClient = await this.getGlueCatalogClient()

            // Call the GetCatalogs API with pagination
            const response = await glueClient.getCatalogs({
                Recursive: true,
                NextToken: nextToken,
            })

            const catalogs: Catalog[] = response.CatalogList || []

            this.logger.info(`GlueCatalogClient: Found ${catalogs.length} catalogs in this page`)
            return {
                catalogs,
                nextToken: response.NextToken,
            }
        } catch (err) {
            this.logger.error('GlueCatalogClient: Failed to get catalogs: %s', err as Error)
            throw err
        }
    }

    /**
     * Gets the Glue client, initializing it if necessary
     */
    private async getGlueCatalogClient(): Promise<GlueCatalog> {
        if (!this.glueClient) {
            try {
                if (this.connectionCredentialsProvider) {
                    // Create client with credential provider function for auto-refresh
                    const awsCredentialProvider = async () => {
                        const credentials = await this.connectionCredentialsProvider!.getCredentials()
                        return {
                            accessKeyId: credentials.accessKeyId,
                            secretAccessKey: credentials.secretAccessKey,
                            sessionToken: credentials.sessionToken,
                            expiration: credentials.expiration,
                        }
                    }

                    this.glueClient = new GlueCatalog({
                        region: this.region,
                        credentials: awsCredentialProvider,
                    })
                } else {
                    // Use default credentials
                    this.glueClient = new GlueCatalog({
                        region: this.region,
                    })
                }

                this.logger.debug('GlueCatalogClient: Successfully created Glue client')
            } catch (err) {
                this.logger.error('GlueCatalogClient: Failed to create Glue client: %s', err as Error)
                throw err
            }
        }
        return this.glueClient
    }
}
