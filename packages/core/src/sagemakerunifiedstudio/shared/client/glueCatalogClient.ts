/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from 'aws-sdk'
import globals from '../../../shared/extensionGlobals'
import { getLogger } from '../../../shared/logger/logger'
import * as GlueCatalogApi from './gluecatalogapi'
import apiConfig = require('./gluecatalogapi.json')
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'
import { adaptConnectionCredentialsProvider } from './credentialsAdapter'

/**
 * Represents a Glue catalog
 */
export type GlueCatalog = GlueCatalogApi.Types.Catalog

/**
 * Client for interacting with Glue Catalog API
 */
export class GlueCatalogClient {
    private glueClient: GlueCatalogApi | undefined
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
    public async getCatalogs(nextToken?: string): Promise<{ catalogs: GlueCatalog[]; nextToken?: string }> {
        try {
            this.logger.info(`GlueCatalogClient: Getting catalogs in region ${this.region}`)

            const glueClient = await this.getGlueCatalogClient()

            // Call the GetCatalogs API with pagination
            const response = await glueClient
                .getCatalogs({
                    Recursive: true,
                    NextToken: nextToken,
                })
                .promise()

            const catalogs: GlueCatalog[] = response.CatalogList || []

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
    private async getGlueCatalogClient(): Promise<GlueCatalogApi> {
        if (!this.glueClient) {
            try {
                if (this.connectionCredentialsProvider) {
                    // Create client with provided credentials
                    this.glueClient = (await globals.sdkClientBuilder.createAwsService(
                        Service,
                        {
                            apiConfig: apiConfig,
                            region: this.region,
                            credentialProvider: adaptConnectionCredentialsProvider(this.connectionCredentialsProvider),
                        } as ServiceConfigurationOptions,
                        undefined,
                        false
                    )) as GlueCatalogApi
                } else {
                    // Use the SDK client builder for default credentials
                    this.glueClient = (await globals.sdkClientBuilder.createAwsService(
                        Service,
                        {
                            apiConfig: apiConfig,
                            region: this.region,
                        } as ServiceConfigurationOptions,
                        undefined,
                        false
                    )) as GlueCatalogApi
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
