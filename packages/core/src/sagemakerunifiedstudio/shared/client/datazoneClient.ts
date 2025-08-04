/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ConnectionCredentials,
    ConnectionSummary,
    DataZone,
    GetConnectionCommandOutput,
    GetEnvironmentCredentialsCommandOutput,
    ListConnectionsCommandOutput,
    PhysicalEndpoint,
    RedshiftPropertiesOutput,
    S3PropertiesOutput,
} from '@aws-sdk/client-datazone'
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

/**
 * Represents JDBC connection properties
 */
export interface JdbcConnection {
    jdbcIamUrl?: string
    jdbcUrl?: string
    username?: string
    password?: string
    secretId?: string
    isProvisionedSecret?: boolean
    redshiftTempDir?: string
    host?: string
    engine?: string
    port?: number
    dbname?: string
    [key: string]: any
}

/**
 * Represents a DataZone connection
 */
export interface DataZoneConnection {
    connectionId: string
    name: string
    description?: string
    type: string
    domainId: string
    environmentId?: string
    projectId: string
    props?: {
        s3Properties?: S3PropertiesOutput
        redshiftProperties?: RedshiftPropertiesOutput
        jdbcConnection?: JdbcConnection
        [key: string]: any
    }
    /**
     * Connection credentials when retrieved with withSecret=true
     */
    connectionCredentials?: ConnectionCredentials
    /**
     * Location information parsed from physical endpoints
     */
    location?: {
        accessRole?: string
        awsRegion?: string
        awsAccountId?: string
        iamConnectionId?: string
    }
}

// Default values, input your domain id here
let defaultDatazoneDomainId = ''
let defaultDatazoneRegion = 'us-east-1'

// Constants for DataZone environment configuration
const toolingBlueprintName = 'Tooling'
const sageMakerProviderName = 'Amazon SageMaker'

// For testing purposes
export function setDefaultDatazoneDomainId(domainId: string): void {
    defaultDatazoneDomainId = domainId
}

// For testing purposes
export function setDefaultDataZoneRegion(region: string): void {
    defaultDatazoneRegion = region
}

export function resetDefaultDatazoneDomainId(): void {
    defaultDatazoneDomainId = ''
}

/**
 * Client for interacting with AWS DataZone API
 */
export class DataZoneClient {
    /**
     * Parse a Redshift connection info object from JDBC URL
     * @param jdbcURL Example JDBC URL: jdbc:redshift://redshift-serverless-workgroup-3zzw0fjmccdixz.123456789012.us-east-1.redshift-serverless.amazonaws.com:5439/dev
     * @returns A object contains info of host, engine, port, dbName
     */
    private getRedshiftConnectionInfoFromJdbcURL(jdbcURL: string) {
        if (!jdbcURL) {
            return
        }

        const [, engine, hostWithLeadingSlashes, portAndDBName] = jdbcURL.split(':')
        const [port, dbName] = portAndDBName.split('/')
        return {
            host: hostWithLeadingSlashes.split('/')[2],
            engine,
            port,
            dbName,
        }
    }

    /**
     * Builds a JDBC connection object from Redshift properties
     * @param redshiftProps The Redshift properties
     * @returns A JDBC connection object
     */
    private buildJdbcConnectionFromRedshiftProps(redshiftProps: RedshiftPropertiesOutput): JdbcConnection {
        const redshiftConnectionInfo = this.getRedshiftConnectionInfoFromJdbcURL(redshiftProps.jdbcUrl ?? '')

        return {
            jdbcIamUrl: redshiftProps.jdbcIamUrl,
            jdbcUrl: redshiftProps.jdbcUrl,
            username: redshiftProps.credentials?.usernamePassword?.username,
            password: redshiftProps.credentials?.usernamePassword?.password,
            secretId: redshiftProps.credentials?.secretArn,
            isProvisionedSecret: redshiftProps.isProvisionedSecret,
            redshiftTempDir: redshiftProps.redshiftTempDir,
            host: redshiftConnectionInfo?.host,
            engine: redshiftConnectionInfo?.engine,
            port: Number(redshiftConnectionInfo?.port),
            dbname: redshiftConnectionInfo?.dbName,
        }
    }

    private datazoneClient: DataZone | undefined
    private static instance: DataZoneClient | undefined
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
     * Disposes the singleton instance and cleans up resources
     */
    public static dispose(): void {
        if (DataZoneClient.instance) {
            const logger = getLogger()
            logger.debug('DataZoneClient: Disposing singleton instance')
            DataZoneClient.instance.datazoneClient = undefined
            DataZoneClient.instance = undefined
        }
    }

    /* Creates a new DataZoneClient instance with specific credentials
     * @param region AWS region
     * @param credentials AWS credentials
     * @returns DataZoneClient instance with credentials
     */
    public static createWithCredentials(
        region: string,
        credentials: {
            accessKeyId: string
            secretAccessKey: string
            sessionToken?: string
        }
    ): DataZoneClient {
        const logger = getLogger()
        logger.info(`DataZoneClient: Creating instance with credentials for region: ${region}`)
        return new DataZoneClient(region, credentials)
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
                this.datazoneClient = new DataZone({
                    region: this.region,
                    credentials: this.credentials,
                })
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

    /**
     * Fetches all projects in a DataZone domain by handling pagination automatically
     * @param options Options for listing projects (excluding nextToken which is handled internally)
     * @returns Promise resolving to an array of all DataZone projects
     */
    public async fetchAllProjects(options?: {
        domainId?: string
        userIdentifier?: string
        groupIdentifier?: string
        name?: string
    }): Promise<DataZoneProject[]> {
        try {
            let allProjects: DataZoneProject[] = []
            let nextToken: string | undefined
            do {
                const maxResultsPerPage = 50
                const response = await this.listProjects({
                    ...options,
                    nextToken,
                    maxResults: maxResultsPerPage,
                })
                allProjects = [...allProjects, ...response.projects]
                nextToken = response.nextToken
            } while (nextToken)

            this.logger.info(`DataZoneClient: Fetched a total of ${allProjects.length} projects`)
            return allProjects
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to fetch all projects: %s', err as Error)
            throw err
        }
    }
    /*
     * Processes a connection response to add jdbcConnection if it's a Redshift connection
     * @param connection The connection object to process
     * @param connectionType The connection type
     */
    private processRedshiftConnection(connection: ConnectionSummary): void {
        if (
            connection &&
            connection.props &&
            'redshiftProperties' in connection.props &&
            connection.props.redshiftProperties &&
            connection.type?.toLowerCase().includes('redshift')
        ) {
            const redshiftProps = connection.props.redshiftProperties as RedshiftPropertiesOutput
            const props = connection.props as Record<string, any>

            if (!props.jdbcConnection) {
                props.jdbcConnection = this.buildJdbcConnectionFromRedshiftProps(redshiftProps)
            }
        }
    }

    /**
     * Parses location from physical endpoints
     * @param physicalEndpoints Array of physical endpoints
     * @returns Location object or undefined
     */
    private parseLocationFromPhysicalEndpoints(physicalEndpoints?: PhysicalEndpoint[]): DataZoneConnection['location'] {
        if (physicalEndpoints && physicalEndpoints.length > 0) {
            const physicalEndpoint = physicalEndpoints[0]
            return {
                accessRole: physicalEndpoint.awsLocation?.accessRole,
                awsRegion: physicalEndpoint.awsLocation?.awsRegion,
                awsAccountId: physicalEndpoint.awsLocation?.awsAccountId,
                iamConnectionId: physicalEndpoint.awsLocation?.iamConnectionId,
            }
        }
        return undefined
    }

    /**
     * Gets a specific connection by ID
     * @param params Parameters for getting a connection
     * @returns The connection details
     */
    public async getConnection(params: {
        domainIdentifier: string
        identifier: string
        withSecret?: boolean
    }): Promise<DataZoneConnection> {
        try {
            this.logger.info(
                `DataZoneClient: Getting connection ${params.identifier} in domain ${params.domainIdentifier}`
            )

            const datazoneClient = await this.getDataZoneClient()

            // Call the DataZone API to get connection
            const response: GetConnectionCommandOutput = await datazoneClient.getConnection({
                domainIdentifier: params.domainIdentifier,
                identifier: params.identifier,
                withSecret: params.withSecret !== undefined ? params.withSecret : true,
            })

            // Process the connection to add jdbcConnection if it's a Redshift connection
            this.processRedshiftConnection(response)

            // Parse location from physical endpoints
            const location = this.parseLocationFromPhysicalEndpoints(response.physicalEndpoints)

            // Return as DataZoneConnection, currently only required fields are added
            // Can always include new fields in DataZoneConnection when needed
            const connection: DataZoneConnection = {
                connectionId: response.connectionId || '',
                name: response.name || '',
                description: response.description,
                type: response.type || '',
                domainId: params.domainIdentifier,
                projectId: response.projectId || '',
                props: response.props || {},
                connectionCredentials: response.connectionCredentials,
                location,
            }

            return connection
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to get connection: %s', err as Error)
            throw err
        }
    }

    /**
     * Lists connections in a DataZone environment
     * @param domainId The DataZone domain identifier
     * @param environmentId The DataZone environment identifier
     * @param projectId The DataZone project identifier
     * @returns List of DataZone connections
     */
    public async listConnections(
        domainId: string,
        environmentId: string | undefined,
        projectId: string
    ): Promise<DataZoneConnection[]> {
        try {
            this.logger.info(
                `DataZoneClient: Listing connections for environment ${environmentId} in domain ${domainId}`
            )

            const datazoneClient = await this.getDataZoneClient()

            // Call the DataZone API to list connections
            const response: ListConnectionsCommandOutput = await datazoneClient.listConnections({
                domainIdentifier: domainId,
                projectIdentifier: projectId,
                environmentIdentifier: environmentId,
            })

            if (!response.items || response.items.length === 0) {
                this.logger.info(`DataZoneClient: No connections found for environment ${environmentId}`)
                return []
            }

            // Map the response to our DataZoneConnection interface
            const connections: DataZoneConnection[] = response.items.map((connection) => {
                // Process the connection to add jdbcConnection if it's a Redshift connection
                this.processRedshiftConnection(connection)

                // Parse location from physical endpoints
                const location = this.parseLocationFromPhysicalEndpoints(connection.physicalEndpoints)

                return {
                    connectionId: connection.connectionId || '',
                    name: connection.name || '',
                    description: '',
                    type: connection.type || '',
                    domainId,
                    environmentId,
                    projectId,
                    props: connection.props || {},
                    location,
                }
            })
            return connections
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to list connections: %s', err as Error)
            throw err
        }
    }
}
