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

/**
 * Represents a Glue catalog
 */
export interface GlueCatalog {
    name: string
    type: string
    parameters?: Record<string, string>
}

/**
 * Client for interacting with Glue Catalog API
 */
export class GlueCatalogClient {
    private glueClient: GlueCatalogApi | undefined
    private static instance: GlueCatalogClient | undefined
    private readonly logger = getLogger()

    private constructor(
        private readonly region: string,
        private readonly credentials?: {
            accessKeyId: string
            secretAccessKey: string
            sessionToken?: string
        }
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
        credentials: {
            accessKeyId: string
            secretAccessKey: string
            sessionToken?: string
        }
    ): GlueCatalogClient {
        return new GlueCatalogClient(region, credentials)
    }

    /**
     * Gets the AWS region
     * @returns AWS region
     */
    public getRegion(): string {
        return this.region
    }

    /**
     * Lists Glue catalogs
     * @returns List of Glue catalogs
     */
    public async getCatalogs(): Promise<GlueCatalog[]> {
        try {
            this.logger.info(`GlueCatalogClient: Getting catalogs in region ${this.region}`)

            const glueClient = await this.getGlueCatalogClient()

            // Call the GetCatalogs API
            const response = await glueClient.getCatalogs().promise()

            if (!response.CatalogList || response.CatalogList.length === 0) {
                this.logger.info('GlueCatalogClient: No catalogs found')
                return []
            }

            // Map the response to our GlueCatalog interface
            const catalogs: GlueCatalog[] = response.CatalogList.map((catalog) => ({
                name: catalog.Name || '',
                type: catalog.CatalogType || '',
                parameters: catalog.Parameters,
            }))

            this.logger.info(`GlueCatalogClient: Found ${catalogs.length} catalogs`)
            return catalogs
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
                if (this.credentials) {
                    // Create client with provided credentials
                    this.glueClient = (await globals.sdkClientBuilder.createAwsService(
                        Service,
                        {
                            apiConfig: apiConfig,
                            region: this.region,
                            credentials: {
                                accessKeyId: this.credentials.accessKeyId,
                                secretAccessKey: this.credentials.secretAccessKey,
                                sessionToken: this.credentials.sessionToken,
                            },
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
