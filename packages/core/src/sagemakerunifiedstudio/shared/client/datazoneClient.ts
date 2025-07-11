/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataZone, GetEnvironmentCredentialsCommandOutput } from '@aws-sdk/client-datazone'
import { getLogger } from '../../../shared/logger/logger'

/**
 * Represents a DataZone project
 */
export interface DataZoneProject {
    id: string
    name: string
    description?: string
    domainId: string
    createdAt?: Date
    updatedAt?: Date
}

// Default values, input your domain id here
let defaultDatazoneDomainId = ''
const defaultDatazoneRegion = 'us-east-1'

// Constants for DataZone environment configuration
const toolingBlueprintName = 'Tooling'
const sageMakerProviderName = 'Amazon SageMaker'

// For testing purposes
export function setDefaultDatazoneDomainId(domainId: string): void {
    defaultDatazoneDomainId = domainId
}

export function resetDefaultDatazoneDomainId(): void {
    defaultDatazoneDomainId = ''
}

/**
 * Client for interacting with AWS DataZone API
 */
export class DataZoneClient {
    private datazoneClient: DataZone | undefined
    private static instance: DataZoneClient | undefined
    private readonly logger = getLogger()

    private constructor(private readonly region: string) {}

    /**
     * Gets a singleton instance of the DataZoneClient
     * @returns DataZoneClient instance
     */
    public static getInstance(): DataZoneClient {
        if (!DataZoneClient.instance) {
            const logger = getLogger()
            if (defaultDatazoneRegion) {
                logger.info(`DataZoneClient: Using default region: ${defaultDatazoneRegion}`)
                DataZoneClient.instance = new DataZoneClient(defaultDatazoneRegion)
                logger.info(`DataZoneClient: Created singleton instance with region ${defaultDatazoneRegion}`)
            } else {
                logger.error('No AWS regions available, please set defaultDatazoneRegion')
                throw new Error('No AWS regions available')
            }
        }
        return DataZoneClient.instance
    }

    /**
     * A workaround to get the DataZone domain ID from default
     * @returns DataZone domain ID
     */
    public getDomainId(): string {
        return defaultDatazoneDomainId
    }

    /**
     * Gets the AWS region
     * @returns AWS region
     */
    public getRegion(): string {
        return this.region
    }

    /**
     * Gets the default tooling environment credentials for a DataZone project
     * @param domainId The DataZone domain identifier
     * @param projectId The DataZone project identifier
     * @returns Promise resolving to environment credentials
     * @throws Error if tooling blueprint or environment is not found
     */
    public async getProjectDefaultEnvironmentCreds(
        domainId: string,
        projectId: string
    ): Promise<GetEnvironmentCredentialsCommandOutput> {
        try {
            this.logger.debug(
                `Getting project default environment credentials for domain ${domainId}, project ${projectId}`
            )
            const datazoneClient = await this.getDataZoneClient()

            this.logger.debug('Listing environment blueprints')
            const domainBlueprints = await datazoneClient.listEnvironmentBlueprints({
                domainIdentifier: domainId,
                managed: true,
                name: toolingBlueprintName,
            })

            const toolingBlueprint = domainBlueprints.items?.[0]
            if (!toolingBlueprint) {
                this.logger.error('Failed to get tooling blueprint')
                throw new Error('Failed to get tooling blueprint')
            }
            this.logger.debug(`Found tooling blueprint with ID: ${toolingBlueprint.id}, listing environments`)

            const listEnvs = await datazoneClient.listEnvironments({
                domainIdentifier: domainId,
                projectIdentifier: projectId,
                environmentBlueprintIdentifier: toolingBlueprint.id,
                provider: sageMakerProviderName,
            })

            const defaultEnv = listEnvs.items?.find((env) => env.name === toolingBlueprintName)
            if (!defaultEnv) {
                this.logger.error('Failed to find default Tooling environment')
                throw new Error('Failed to find default Tooling environment')
            }
            this.logger.debug(`Found default environment with ID: ${defaultEnv.id}, getting environment credentials`)

            const defaultEnvCreds = await datazoneClient.getEnvironmentCredentials({
                domainIdentifier: domainId,
                environmentIdentifier: defaultEnv.id,
            })

            // Log credential details for debugging (masking sensitive parts)
            this.logger.debug(
                `Retrieved environment credentials with accessKeyId: ${
                    defaultEnvCreds.accessKeyId ? defaultEnvCreds.accessKeyId.substring(0, 5) + '...' : 'undefined'
                }`
            )
            this.logger.debug(`SessionToken present: ${defaultEnvCreds.sessionToken ? 'Yes' : 'No'}`)

            return defaultEnvCreds
        } catch (err) {
            this.logger.error('Failed to get project default environment credentials: %s', err as Error)
            throw err
        }
    }

    /**
     * Gets the DataZone client, initializing it if necessary
     */
    private async getDataZoneClient(): Promise<DataZone> {
        if (!this.datazoneClient) {
            try {
                this.datazoneClient = new DataZone({ region: this.region })
                this.logger.debug('DataZoneClient: Successfully created DataZone client')
            } catch (err) {
                this.logger.error('DataZoneClient: Failed to create DataZone client: %s', err as Error)
                throw err
            }
        }
        return this.datazoneClient
    }

    /**
     * Lists projects in a DataZone domain with pagination support
     * @param options Options for listing projects
     * @returns Paginated list of DataZone projects with nextToken
     */
    public async listProjects(options?: {
        domainId?: string
        maxResults?: number
        userIdentifier?: string
        groupIdentifier?: string
        name?: string
        nextToken?: string
    }): Promise<{ projects: DataZoneProject[]; nextToken?: string }> {
        try {
            // Use provided domain ID or get from stored config
            const targetDomainId = options?.domainId || this.getDomainId()

            this.logger.info(`DataZoneClient: Listing projects for domain ${targetDomainId} in region ${this.region}`)

            const datazoneClient = await this.getDataZoneClient()

            // Call the DataZone API to list projects with pagination
            const response = await datazoneClient.listProjects({
                domainIdentifier: targetDomainId,
                maxResults: options?.maxResults,
                userIdentifier: options?.userIdentifier,
                groupIdentifier: options?.groupIdentifier,
                name: options?.name,
                nextToken: options?.nextToken,
            })

            if (!response.items || response.items.length === 0) {
                this.logger.info(`DataZoneClient: No projects found for domain ${targetDomainId}`)
                return { projects: [] }
            }

            // Map the response to our DataZoneProject interface
            const projects: DataZoneProject[] = response.items.map((project) => ({
                id: project.id || '',
                name: project.name || '',
                description: project.description,
                domainId: targetDomainId,
                createdAt: project.createdAt ? new Date(project.createdAt) : undefined,
                updatedAt: project.updatedAt ? new Date(project.updatedAt) : undefined,
            }))

            this.logger.info(`DataZoneClient: Found ${projects.length} projects for domain ${targetDomainId}`)
            return { projects, nextToken: response.nextToken }
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to list projects: %s', err as Error)
            throw err
        }
    }
}
