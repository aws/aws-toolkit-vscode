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
import { ToolkitError } from '../../../shared/errors'
import fetch from 'node-fetch'

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

/**
 * Represents SSO instance information retrieved from DataZone
 */
export interface SsoInstanceInfo {
    issuerUrl: string
    ssoInstanceId: string
    clientId: string
    region: string
}

/**
 * Response from DataZone /sso/login endpoint
 */
interface DataZoneSsoLoginResponse {
    redirectUrl: string
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
     * Makes HTTP call to DataZone /sso/login endpoint
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @param domainId The extracted domain ID
     * @returns Promise resolving to the login response
     * @throws ToolkitError if the API call fails
     */
    private async callDataZoneLogin(domainUrl: string, domainId: string): Promise<DataZoneSsoLoginResponse> {
        const loginUrl = new URL('/sso/login', domainUrl)
        const requestBody = {
            domainId: domainId,
        }

        const response = await fetch(loginUrl.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': 'aws-toolkit-vscode',
            },
            body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
            throw new ToolkitError(`DataZone login failed: ${response.status} ${response.statusText}`, {
                code: 'DataZoneLoginFailed',
            })
        }

        return (await response.json()) as DataZoneSsoLoginResponse
    }

    /**
     * Gets SSO instance information by calling DataZone /sso/login endpoint
     * This extracts the proper SSO instance ID and issuer URL needed for OAuth client registration
     *
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @returns Promise resolving to SSO instance information
     * @throws ToolkitError if the API call fails or response is invalid
     */
    public async getSsoInstanceInfo(domainUrl: string): Promise<SsoInstanceInfo> {
        try {
            this.logger.info(`SMUS Auth: Getting SSO instance info from DataZone for domainurl: ${domainUrl}`)
            // Extract domain ID from the domain URL
            const domainId = this.extractDomainIdFromUrl(domainUrl)
            if (!domainId) {
                throw new ToolkitError('Invalid domain URL format', { code: 'InvalidDomainUrl' })
            }

            // Call DataZone /sso/login endpoint to get redirect URL with SSO instance info
            const loginData = await this.callDataZoneLogin(domainUrl, domainId)
            if (!loginData.redirectUrl) {
                throw new ToolkitError('No redirect URL received from DataZone login', { code: 'InvalidLoginResponse' })
            }

            // Parse the redirect URL to extract SSO instance information
            const redirectUrl = new URL(loginData.redirectUrl)
            const clientIdParam = redirectUrl.searchParams.get('client_id')
            if (!clientIdParam) {
                throw new ToolkitError('No client_id found in DataZone redirect URL', { code: 'InvalidRedirectUrl' })
            }

            // Decode the client_id ARN: arn:aws:sso::1234567890:application/ssoins-instanceid/abc-12ab34de
            const decodedClientId = decodeURIComponent(clientIdParam)
            const arnParts = decodedClientId.split('/')
            if (arnParts.length < 2) {
                throw new ToolkitError('Invalid client_id ARN format', { code: 'InvalidArnFormat' })
            }

            const ssoInstanceId = arnParts[1] // Extract ssoins-6684636af7e1a207
            const issuerUrl = `https://identitycenter.amazonaws.com/${ssoInstanceId}`

            // Extract region from domain URL
            const region = this.extractRegionFromUrl(domainUrl)

            this.logger.info('SMUS Auth: Extracted SSO instance info: %s', ssoInstanceId)

            return {
                issuerUrl,
                ssoInstanceId,
                clientId: decodedClientId,
                region,
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            this.logger.error('SMUS Auth: Failed to get SSO instance info: %s', errorMsg)

            if (error instanceof ToolkitError) {
                throw error
            }

            throw new ToolkitError(`Failed to get SSO instance info: ${errorMsg}`, {
                code: 'SsoInstanceInfoFailed',
                cause: error instanceof Error ? error : undefined,
            })
        }
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
     * Extracts the domain ID from a SageMaker Unified Studio domain URL
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @returns The extracted domain ID or undefined if not found
     */
    private extractDomainIdFromUrl(domainUrl: string): string | undefined {
        try {
            // Domain URL format: https://dzd_d3hr1nfjbtwui1.sagemaker.us-east-2.on.aws
            const url = new URL(domainUrl)
            const hostname = url.hostname

            // Extract domain ID from hostname (dzd_d3hr1nfjbtwui1 or dzd-d3hr1nfjbtwui1)
            const domainIdMatch = hostname.match(/^(dzd[-_][a-zA-Z0-9_-]{1,36})\./)
            return domainIdMatch?.[1]
        } catch (error) {
            this.logger.error('Failed to extract domain ID from URL: %s', error as Error)
            return undefined
        }
    }

    /**
     * Extracts the AWS region from a SageMaker Unified Studio domain URL
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @returns The extracted AWS region or the default region if not found
     */
    private extractRegionFromUrl(domainUrl: string): string {
        try {
            // Domain URL format: https://dzd_d3hr1nfjbtwui1.sagemaker.us-east-2.on.aws
            const url = new URL(domainUrl)
            const hostname = url.hostname

            // Extract region from hostname (us-east-2)
            const regionMatch = hostname.match(/\.sagemaker\.([a-z0-9-]+)\.on\.aws$/)
            return regionMatch?.[1] || this.region
        } catch (error) {
            this.logger.error('Failed to extract region from URL: %s', error as Error)
            return this.region
        }
    }

    /**
     * Extracts both domain ID and region from a SageMaker Unified Studio domain URL
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @returns Object containing domainId and region
     */
    public extractDomainInfoFromUrl(domainUrl: string): { domainId: string | undefined; region: string } {
        return {
            domainId: this.extractDomainIdFromUrl(domainUrl),
            region: this.extractRegionFromUrl(domainUrl),
        }
    }

    /**
     * Validates the domain URL format for SageMaker Unified Studio
     * @param value The URL to validate
     * @returns Error message if invalid, undefined if valid
     */
    public validateDomainUrl(value: string): string | undefined {
        if (!value || value.trim() === '') {
            return 'Domain URL is required'
        }

        const trimmedValue = value.trim()

        // Check HTTPS requirement
        if (!trimmedValue.startsWith('https://')) {
            return 'Domain URL must use HTTPS (https://)'
        }

        // Check basic URL format
        try {
            const url = new URL(trimmedValue)

            // Check if it looks like a SageMaker Unified Studio domain
            if (!url.hostname.includes('sagemaker') || !url.hostname.includes('on.aws')) {
                return 'URL must be a valid SageMaker Unified Studio domain (e.g., https://dzd_xxxxxxxxx.sagemaker.us-east-1.on.aws)'
            }

            // Extract domain ID to validate
            const domainId = this.extractDomainIdFromUrl(trimmedValue)

            if (!domainId) {
                return 'URL must contain a valid domain ID (starting with dzd- or dzd_)'
            }

            return undefined // Valid
        } catch (err) {
            return 'Invalid URL format'
        }
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
