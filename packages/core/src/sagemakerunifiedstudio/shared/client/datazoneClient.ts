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
    ConnectionType,
    GluePropertiesOutput,
    GetEnvironmentCommandOutput,
} from '@aws-sdk/client-datazone'
import { getLogger } from '../../../shared/logger/logger'
import type { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { DefaultStsClient } from '../../../shared/clients/stsClient'

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
        glueProperties?: GluePropertiesOutput
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

// Constants for DataZone environment configuration
const toolingBlueprintName = 'Tooling'
const sageMakerProviderName = 'Amazon SageMaker'

/**
 * Client for interacting with AWS DataZone API with DER credential support
 *
 * This client integrates with SmusAuthenticationProvider to provide authenticated
 * DataZone operations using Domain Execution Role (DER) credentials.
 *
 * One instance per connection/domainId is maintained to avoid duplication.
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
    private static instances = new Map<string, DataZoneClient>()
    private readonly logger = getLogger()

    private constructor(
        private readonly authProvider: SmusAuthenticationProvider,
        private readonly domainId: string,
        private readonly region: string
    ) {}

    /**
     * Gets an authenticated DataZoneClient instance using DER credentials
     * One instance per connection/domainId is maintained
     * @param authProvider The SMUS authentication provider
     * @returns Promise resolving to authenticated DataZoneClient instance
     */
    public static async getInstance(authProvider: SmusAuthenticationProvider): Promise<DataZoneClient> {
        const logger = getLogger()

        if (!authProvider.isConnected()) {
            throw new Error('SMUS authentication provider is not connected')
        }

        const activeConnection = authProvider.activeConnection!
        const instanceKey = `${activeConnection.domainId}:${activeConnection.ssoRegion}`

        logger.debug(`DataZoneClient: Getting instance for domain: ${instanceKey}`)

        // Check if we already have an instance for this domain/region
        if (DataZoneClient.instances.has(instanceKey)) {
            const existingInstance = DataZoneClient.instances.get(instanceKey)!
            logger.debug('DataZoneClient: Using existing instance')
            return existingInstance
        }

        // Create new instance
        logger.debug('DataZoneClient: Creating new instance')
        const instance = new DataZoneClient(authProvider, activeConnection.domainId, activeConnection.ssoRegion)
        DataZoneClient.instances.set(instanceKey, instance)

        // Set up cleanup when connection changes
        const disposable = authProvider.onDidChangeActiveConnection(() => {
            logger.debug(`DataZoneClient: Connection changed, cleaning up instance for: ${instanceKey}`)
            DataZoneClient.instances.delete(instanceKey)
            instance.datazoneClient = undefined
            disposable.dispose()
        })

        logger.info(`DataZoneClient: Created instance for domain ${activeConnection.domainId}`)
        return instance
    }

    /**
     * Disposes all instances and cleans up resources
     */
    public static dispose(): void {
        const logger = getLogger()
        logger.debug('DataZoneClient: Disposing all instances')

        for (const [key, instance] of DataZoneClient.instances.entries()) {
            instance.datazoneClient = undefined
            logger.debug(`DataZoneClient: Disposed instance for: ${key}`)
        }

        DataZoneClient.instances.clear()
    }

    /**
     * Gets the DataZone domain ID
     * @returns DataZone domain ID
     */
    public getDomainId(): string {
        return this.domainId
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
     * @param projectId The DataZone project identifier
     * @returns Promise resolving to environment credentials
     * @throws Error if tooling blueprint or environment is not found
     */
    public async getProjectDefaultEnvironmentCreds(projectId: string): Promise<GetEnvironmentCredentialsCommandOutput> {
        try {
            this.logger.debug(
                `Getting project default environment credentials for domain ${this.domainId}, project ${projectId}`
            )
            const datazoneClient = await this.getDataZoneClient()

            this.logger.debug('Listing environment blueprints')
            const domainBlueprints = await datazoneClient.listEnvironmentBlueprints({
                domainIdentifier: this.domainId,
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
                domainIdentifier: this.domainId,
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
                domainIdentifier: this.domainId,
                environmentIdentifier: defaultEnv.id,
            })

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
                this.logger.debug('DataZoneClient: Creating authenticated DataZone client with DER credentials')

                const credentialsProvider = async () => {
                    const credentials = await (await this.authProvider.getDerCredentialsProvider()).getCredentials()
                    return {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken,
                        expiration: credentials.expiration,
                    }
                }

                this.datazoneClient = new DataZone({
                    region: this.region,
                    credentials: credentialsProvider,
                })
                this.logger.debug('DataZoneClient: Successfully created authenticated DataZone client')
            } catch (err) {
                this.logger.error('DataZoneClient: Failed to create DataZone client: %s', err as Error)
                throw err
            }
        }
        return this.datazoneClient
    }

    /**
     * Lists project memberships in a DataZone project with pagination support
     * @param options Options for listing project memberships
     * @returns Paginated list of DataZone project permissions with nextToken
     */
    public async listProjectMemberships(options: {
        projectIdentifier: string
        maxResults?: number
        nextToken?: string
    }): Promise<{ memberships: any[]; nextToken?: string }> {
        try {
            this.logger.info(
                `DataZoneClient: Listing project memberships for project ${options.projectIdentifier} in domain ${this.domainId}`
            )

            const datazoneClient = await this.getDataZoneClient()

            const response = await datazoneClient.listProjectMemberships({
                domainIdentifier: this.domainId,
                projectIdentifier: options.projectIdentifier,
                maxResults: options.maxResults,
                nextToken: options.nextToken,
            })

            if (!response.members || response.members.length === 0) {
                this.logger.info(
                    `DataZoneClient: No project memberships found for project ${options.projectIdentifier}`
                )
                return { memberships: [] }
            }

            this.logger.debug(
                `DataZoneClient: Found ${response.members.length} project memberships for project ${options.projectIdentifier}`
            )
            return { memberships: response.members, nextToken: response.nextToken }
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to list project memberships: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Fetches all project memberships in a DataZone project by handling pagination automatically
     * @param projectIdentifier The DataZone project identifier
     * @returns Promise resolving to an array of all project memberships
     */
    public async fetchAllProjectMemberships(projectIdentifier: string): Promise<any[]> {
        try {
            let allMemberships: any[] = []
            let nextToken: string | undefined
            do {
                const maxResultsPerPage = 50
                const response = await this.listProjectMemberships({
                    projectIdentifier,
                    nextToken,
                    maxResults: maxResultsPerPage,
                })
                allMemberships = [...allMemberships, ...response.memberships]
                nextToken = response.nextToken
            } while (nextToken)

            this.logger.debug(`DataZoneClient: Fetched a total of ${allMemberships.length} project memberships`)
            return allMemberships
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to fetch all project memberships: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Lists projects in a DataZone domain with pagination support
     * @param options Options for listing projects
     * @returns Paginated list of DataZone projects with nextToken
     */
    public async listProjects(options?: {
        maxResults?: number
        userIdentifier?: string
        groupIdentifier?: string
        name?: string
        nextToken?: string
    }): Promise<{ projects: DataZoneProject[]; nextToken?: string }> {
        try {
            this.logger.info(`DataZoneClient: Listing projects for domain ${this.domainId} in region ${this.region}`)

            const datazoneClient = await this.getDataZoneClient()

            // Call the DataZone API to list projects with pagination
            const response = await datazoneClient.listProjects({
                domainIdentifier: this.domainId,
                maxResults: options?.maxResults,
                userIdentifier: options?.userIdentifier,
                groupIdentifier: options?.groupIdentifier,
                name: options?.name,
                nextToken: options?.nextToken,
            })

            if (!response.items || response.items.length === 0) {
                this.logger.info(`DataZoneClient: No projects found for domain ${this.domainId}`)
                return { projects: [] }
            }

            // Map the response to our DataZoneProject interface
            const projects: DataZoneProject[] = response.items.map((project) => ({
                id: project.id || '',
                name: project.name || '',
                description: project.description,
                domainId: this.domainId,
                createdAt: project.createdAt ? new Date(project.createdAt) : undefined,
                updatedAt: project.updatedAt ? new Date(project.updatedAt) : undefined,
            }))

            this.logger.debug(`DataZoneClient: Found ${projects.length} projects for domain ${this.domainId}`)
            return { projects, nextToken: response.nextToken }
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to list projects: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Fetches all projects in a DataZone domain by handling pagination automatically
     * @param options Options for listing projects (excluding nextToken which is handled internally)
     * @returns Promise resolving to an array of all DataZone projects
     */
    public async fetchAllProjects(options?: {
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

            this.logger.debug(`DataZoneClient: Fetched a total of ${allProjects.length} projects`)
            return allProjects
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to fetch all projects: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Gets a specific project by ID
     * @param projectId The project identifier
     * @returns Promise resolving to the project details
     */
    public async getProject(projectId: string): Promise<DataZoneProject> {
        try {
            this.logger.info(`DataZoneClient: Getting project ${projectId} in domain ${this.domainId}`)

            const datazoneClient = await this.getDataZoneClient()

            const response = await datazoneClient.getProject({
                domainIdentifier: this.domainId,
                identifier: projectId,
            })

            const project: DataZoneProject = {
                id: response.id || '',
                name: response.name || '',
                description: response.description,
                domainId: this.domainId,
                createdAt: response.createdAt ? new Date(response.createdAt) : undefined,
                updatedAt: response.lastUpdatedAt ? new Date(response.lastUpdatedAt) : undefined,
            }

            this.logger.debug(`DataZoneClient: Retrieved project ${projectId} with name: ${project.name}`)
            return project
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to get project: %s', err as Error)
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

    public async fetchConnections(
        domain: string | undefined,
        project: string | undefined,
        ConnectionType: ConnectionType
    ): Promise<ListConnectionsCommandOutput> {
        const datazoneClient = await this.getDataZoneClient()
        return datazoneClient.listConnections({
            domainIdentifier: domain,
            projectIdentifier: project,
            type: ConnectionType,
        })
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
            let allConnections: DataZoneConnection[] = []
            let nextToken: string | undefined

            do {
                // Call the DataZone API to list connections with pagination
                const response: ListConnectionsCommandOutput = await datazoneClient.listConnections({
                    domainIdentifier: domainId,
                    projectIdentifier: projectId,
                    environmentIdentifier: environmentId,
                    nextToken,
                    maxResults: 50,
                })

                if (response.items && response.items.length > 0) {
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
                    allConnections = [...allConnections, ...connections]
                }

                nextToken = response.nextToken
            } while (nextToken)

            this.logger.info(`DataZoneClient: Fetched a total of ${allConnections.length} connections`)
            return allConnections
        } catch (err) {
            this.logger.error('DataZoneClient: Failed to list connections: %s', err as Error)
            throw err
        }
    }

    /**
     * Gets the tooling environment ID for a project
     * @param domainId The DataZone domain identifier
     * @param projectId The DataZone project identifier
     * @returns Promise resolving to the tooling environment ID
     */
    public async getToolingEnvironmentId(domainId: string, projectId: string): Promise<string> {
        this.logger.debug(`Getting tooling environment ID for domain ${domainId}, project ${projectId}`)
        const datazoneClient = await this.getDataZoneClient()

        let domainBlueprints
        try {
            // Get the tooling blueprint
            domainBlueprints = await datazoneClient.listEnvironmentBlueprints({
                domainIdentifier: domainId,
                managed: true,
                name: toolingBlueprintName,
            })
        } catch (err) {
            this.logger.error(
                'Failed to list environment blueprints for domain %s, %s',
                domainId,
                (err as Error).message
            )
            throw err
        }

        const toolingBlueprint = domainBlueprints.items?.[0]
        if (!toolingBlueprint) {
            this.logger.error('No tooling blueprint found for domain %s', domainId)
            throw new Error('No tooling blueprint found')
        }

        // List environments for the project
        let listEnvs
        try {
            this.logger.debug(`Listing environments for project ${projectId} with blueprint ${toolingBlueprint.id}`)
            listEnvs = await datazoneClient.listEnvironments({
                domainIdentifier: domainId,
                projectIdentifier: projectId,
                environmentBlueprintIdentifier: toolingBlueprint.id,
                provider: sageMakerProviderName,
            })
        } catch (err) {
            this.logger.error(
                'Failed to list environments for domainId: %s, projectId: %s, %s',
                domainId,
                projectId,
                (err as Error).message
            )
            throw err
        }

        const defaultEnv = listEnvs.items?.find((env) => env.name === toolingBlueprintName)
        if (!defaultEnv || !defaultEnv.id) {
            this.logger.error(
                'No default Tooling environment found for domainId: %s, projectId: %s',
                domainId,
                projectId
            )
            throw new Error('No default Tooling environment found for project')
        }
        this.logger.debug(`Found tooling environment with ID: ${defaultEnv.id}`)
        return defaultEnv.id
    }

    /**
     * Gets environment details
     * @param domainId The DataZone domain identifier
     * @param environmentId The environment identifier
     * @returns Promise resolving to environment details
     */
    public async getEnvironmentDetails(
        environmentId: string
    ): Promise<import('@aws-sdk/client-datazone').GetEnvironmentCommandOutput> {
        try {
            this.logger.debug(
                `Getting environment details for domain ${this.getDomainId()}, environment ${environmentId}`
            )
            const datazoneClient = await this.getDataZoneClient()

            const environment = await datazoneClient.getEnvironment({
                domainIdentifier: this.getDomainId(),
                identifier: environmentId,
            })

            this.logger.debug(`Retrieved environment details for ${environmentId}`)
            return environment
        } catch (err) {
            this.logger.error('Failed to get environment details: %s', err as Error)
            throw err
        }
    }

    /**
     * Gets the tooling environment details for a project
     * @param projectId The project ID
     * @returns The tooling environment details
     */
    public async getToolingEnvironment(projectId: string): Promise<GetEnvironmentCommandOutput> {
        const logger = getLogger()

        const datazoneClient = await DataZoneClient.getInstance(this.authProvider)
        if (!datazoneClient) {
            throw new Error('DataZone client is not initialized')
        }

        const toolingEnvId = await datazoneClient
            .getToolingEnvironmentId(datazoneClient.getDomainId(), projectId)
            .catch((err) => {
                logger.error('Failed to get tooling environment ID for project %s', projectId)
                throw new Error(`Failed to get tooling environment ID: ${err.message}`)
            })

        if (!toolingEnvId) {
            throw new Error('No default environment found for project')
        }

        return await datazoneClient.getEnvironmentDetails(toolingEnvId)
    }

    public async getUserId(): Promise<string | undefined> {
        const derCredProvider = await this.authProvider.getDerCredentialsProvider()
        this.logger.debug(`Calling STS GetCallerIdentity using DER credentials of ${this.getDomainId()}`)
        const stsClient = new DefaultStsClient(this.getRegion(), await derCredProvider.getCredentials())
        const callerIdentity = await stsClient.getCallerIdentity()
        this.logger.debug(`Retrieved caller identity, UserId: ${callerIdentity.UserId}`)
        return callerIdentity.UserId
    }
}
