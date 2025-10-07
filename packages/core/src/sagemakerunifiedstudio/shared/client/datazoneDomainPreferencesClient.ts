/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../../shared/logger/logger'
import apiConfig = require('./datazonedomainpreferences.json')
import globals from '../../../shared/extensionGlobals'
import { Service } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import * as DataZoneDomainPreferences from './datazonedomainpreferences'
import { adaptConnectionCredentialsProvider } from './credentialsAdapter'
import { CredentialsProvider } from '../../../auth/providers/credentials'

export type ListDomainsOutput = DataZoneDomainPreferences.Types.ListDomainsOutput
export type GetDomainOutput = DataZoneDomainPreferences.Types.GetDomainOutput

export interface DataZoneDomain {
    id: string
    name: string
    description?: string
    arn: string
    managedAccountId: string
    status: string
    portalUrl?: string
    createdAt?: Date
    lastUpdatedAt?: Date
    domainVersion?: string
    preferences?: any
}

/**
 * Client for interacting with AWS DataZone API
 */
export class DataZoneDomainPreferencesClient {
    private datazoneDomainPreferencesClient: DataZoneDomainPreferences | undefined
    private static instances = new Map<string, DataZoneDomainPreferencesClient>()
    private readonly logger = getLogger()

    private constructor(
        private readonly credentialProvider: CredentialsProvider,
        private readonly region: string
    ) {}

    /**
     * Gets a singleton instance of the DataZoneDomainPreferencesClient
     * @returns DataZoneDomainPreferencesClient instance
     */
    public static getInstance(
        credentialProvider: CredentialsProvider,
        region: string
    ): DataZoneDomainPreferencesClient {
        const logger = getLogger()

        const instanceKey = `${region}`

        // Check if we already have an instance for this instanceKey
        if (DataZoneDomainPreferencesClient.instances.has(instanceKey)) {
            const existingInstance = DataZoneDomainPreferencesClient.instances.get(instanceKey)!
            logger.debug(`DataZoneDomainPreferencesClient: Using existing instance for instanceKey ${instanceKey}`)
            return existingInstance
        }

        // Create new instance
        logger.debug('DataZoneDomainPreferencesClient: Creating new instance')
        const instance = new DataZoneDomainPreferencesClient(credentialProvider, region)
        DataZoneDomainPreferencesClient.instances.set(instanceKey, instance)

        logger.debug(`DataZoneDomainPreferencesClient: Created instance with instanceKey ${instanceKey}`)

        return instance
    }

    /**
     * Disposes all instances and cleans up resources
     */
    public static dispose(): void {
        const logger = getLogger()
        logger.debug('DataZoneDomainPreferencesClient: Disposing all instances')

        for (const [key, instance] of DataZoneDomainPreferencesClient.instances.entries()) {
            instance.datazoneDomainPreferencesClient = undefined
            logger.debug(`DataZoneDomainPreferencesClient: Disposed instance for: ${key}`)
        }

        DataZoneDomainPreferencesClient.instances.clear()
    }

    /**
     * Gets the AWS region
     * @returns AWS region
     */
    public getRegion(): string {
        return this.region
    }

    /**
     * Gets the DataZone client, initializing it if necessary
     */
    private async getDataZoneDomainPreferencesClient(): Promise<DataZoneDomainPreferences> {
        if (!this.datazoneDomainPreferencesClient) {
            try {
                this.logger.info('DataZoneDomainPreferencesClient: Creating authenticated DataZone client')

                this.datazoneDomainPreferencesClient = (await globals.sdkClientBuilder.createAwsService(
                    Service,
                    {
                        apiConfig: apiConfig,
                        endpoint: `https://datazone.${this.region}.api.aws`,
                        region: this.region,
                        credentialProvider: adaptConnectionCredentialsProvider(this.credentialProvider),
                    } as ServiceConfigurationOptions,
                    undefined,
                    false
                )) as DataZoneDomainPreferences

                this.logger.info('DataZonePreferencesClient: Successfully created authenticated DataZone client')
            } catch (err) {
                this.logger.error('DataZonePreferencesClient: Failed to create DataZone client: %s', err as Error)
                throw err
            }
        }
        return this.datazoneDomainPreferencesClient
    }

    /**
     * Lists domains in DataZone with pagination support
     * @param options Options for listing domains
     * @returns Paginated list of DataZone domains with nextToken
     */
    public async listDomains(options?: {
        maxResults?: number
        status?: string
        nextToken?: string
    }): Promise<{ domains: DataZoneDomain[]; nextToken?: string }> {
        try {
            this.logger.info(`DataZoneDomainPreferencesClient: Listing domains in region ${this.region}`)

            const datazoneDomainPreferencesClient = await this.getDataZoneDomainPreferencesClient()

            // Call DataZone API to list domains with pagination
            const response = await datazoneDomainPreferencesClient
                .listDomains({
                    maxResults: options?.maxResults,
                    status: options?.status,
                    nextToken: options?.nextToken,
                })
                .promise()

            if (!response.items || response.items.length === 0) {
                this.logger.info(`DataZoneDomainPreferencesClient: No domains found`)
                return { domains: [] }
            }

            // Map the response to our DataZoneDomain interface
            const domains: DataZoneDomain[] = response.items.map((domain) => ({
                id: domain.id || '',
                name: domain.name || '',
                description: domain.description,
                arn: domain.arn || '',
                managedAccountId: domain.managedAccountId || '',
                status: domain.status || '',
                portalUrl: domain.portalUrl,
                createdAt: domain.createdAt ? new Date(domain.createdAt) : undefined,
                lastUpdatedAt: domain.lastUpdatedAt ? new Date(domain.lastUpdatedAt) : undefined,
                domainVersion: domain.domainVersion,
                preferences: domain.preferences,
            }))

            this.logger.debug(`DataZoneDomainPreferencesClient: Found ${domains.length} domains`)
            return { domains, nextToken: response.nextToken }
        } catch (err) {
            this.logger.error('DataZoneDomainPreferencesClient: Failed to list domains: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Fetches all domains by handling pagination automatically
     * @param options Options for listing domains (excluding nextToken which is handled internally)
     * @returns Promise resolving to an array of all DataZone domains
     */
    public async fetchAllDomains(options?: { status?: string }): Promise<DataZoneDomain[]> {
        try {
            let allDomains: DataZoneDomain[] = []
            let nextToken: string | undefined
            do {
                const maxResultsPerPage = 25
                const response = await this.listDomains({
                    ...options,
                    nextToken,
                    maxResults: maxResultsPerPage,
                })
                allDomains = [...allDomains, ...response.domains]
                nextToken = response.nextToken
            } while (nextToken)

            this.logger.debug(`DataZoneDomainPreferencesClient: Fetched a total of ${allDomains.length} domains`)
            return allDomains
        } catch (err) {
            this.logger.error(
                'DataZoneDomainPreferencesClient: Failed to fetch all domains: %s',
                (err as Error).message
            )
            throw err
        }
    }

    /**
     * Gets the domain with EXPRESS mode in preferences using pagination with early termination
     * @returns Promise resolving to the DataZone domain or undefined if not found
     */
    public async getExpressDomain(): Promise<DataZoneDomain | undefined> {
        const logger = getLogger()

        try {
            logger.info('DataZoneDomainPreferencesClient: Getting the domain info')

            let nextToken: string | undefined
            let totalDomainsChecked = 0
            const maxResultsPerPage = 25

            // Paginate through domains and check each page for EXPRESS domain
            do {
                const response = await this.listDomains({
                    status: 'AVAILABLE',
                    nextToken,
                    maxResults: maxResultsPerPage,
                })

                const { domains } = response
                totalDomainsChecked += domains.length

                logger.debug(
                    `DataZoneDomainPreferencesClient: Checking ${domains.length} domains in current page (total checked: ${totalDomainsChecked})`
                )

                // Check each domain in the current page for EXPRESS mode
                for (const domain of domains) {
                    if (domain.preferences && domain.preferences.DOMAIN_MODE === 'EXPRESS') {
                        logger.info(
                            `DataZoneDomainPreferencesClient: Found EXPRESS domain, id: ${domain.id} (${domain.name})`
                        )
                        return domain
                    }
                }

                nextToken = response.nextToken
            } while (nextToken)

            logger.info(
                `DataZoneDomainPreferencesClient: No domain with (DOMAIN_MODE: EXPRESS) found after checking all ${totalDomainsChecked} domains`
            )
            return undefined
        } catch (err) {
            logger.error('DataZoneDomainPreferencesClient: Failed to get domain info: %s', err as Error)
            throw new Error(`Failed to get domain info: ${(err as Error).message}`)
        }
    }
}
