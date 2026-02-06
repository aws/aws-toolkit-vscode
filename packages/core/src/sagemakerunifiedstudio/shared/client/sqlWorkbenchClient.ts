/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../../shared/logger/logger'
import {
    SQLWorkbench,
    GetResourcesCommand,
    ExecuteQueryCommand,
    GetResourcesRequest,
    GetResourcesResponse,
    ExecuteQueryRequest,
    DatabaseConnectionConfiguration,
    ParentResource,
    DatabaseIntegrationConnectionAuthenticationTypes,
} from '@amzn/sql-workbench-client'
import { v4 as uuidv4 } from 'uuid'
import { getRedshiftTypeFromHost } from '../../explorer/nodes/utils'
import { RedshiftType } from '../../explorer/nodes/types'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'

/**
 * Connection configuration for SQL Workbench
 * This is an alias for the SDK's DatabaseConnectionConfiguration type
 */
export type ConnectionConfig = DatabaseConnectionConfiguration

/**
 * Gets a SQL Workbench ARN
 * @param region AWS region
 * @param accountId Optional AWS account ID (will be determined if not provided)
 * @returns SQL Workbench ARN
 */
export async function generateSqlWorkbenchArn(region: string, accountId: string): Promise<string> {
    return `arn:aws:sqlworkbench:${region}:${accountId}:connection/${uuidv4()}`
}

/**
 * Creates a connection configuration for Redshift
 */
export async function createRedshiftConnectionConfig(
    host: string,
    database: string,
    accountId: string,
    region: string,
    secretArn?: string,
    isGlueCatalogDatabase?: boolean
): Promise<ConnectionConfig> {
    // Get Redshift deployment type from host
    const redshiftDeploymentType = getRedshiftTypeFromHost(host)

    // Extract resource identifier from host
    const resourceIdentifier = host.split('.')[0]

    if (!resourceIdentifier) {
        throw new Error('Resource identifier could not be determined from host')
    }

    // Create connection ID using the proper ARN format
    const connectionId = await generateSqlWorkbenchArn(region, accountId)

    // Determine if serverless or cluster based on deployment type
    const isServerless =
        redshiftDeploymentType === RedshiftType.Serverless ||
        redshiftDeploymentType === RedshiftType.ServerlessDev ||
        redshiftDeploymentType === RedshiftType.ServerlessQA

    const isCluster =
        redshiftDeploymentType === RedshiftType.Cluster ||
        redshiftDeploymentType === RedshiftType.ClusterDev ||
        redshiftDeploymentType === RedshiftType.ClusterQA

    // Validate the Redshift type
    if (!isServerless && !isCluster) {
        throw new Error(`Unsupported Redshift type for host: ${host}`)
    }

    // Determine auth type based on the provided parameters
    let authType: DatabaseIntegrationConnectionAuthenticationTypes

    if (secretArn) {
        authType = DatabaseIntegrationConnectionAuthenticationTypes.SECRET
    } else if (isCluster) {
        authType = DatabaseIntegrationConnectionAuthenticationTypes.TEMPORARY_CREDENTIALS_WITH_IAM
    } else {
        // For serverless
        authType = DatabaseIntegrationConnectionAuthenticationTypes.FEDERATED
    }

    // Enforce specific authentication type for S3Table/RedLake databases
    if (isGlueCatalogDatabase) {
        authType = isServerless
            ? DatabaseIntegrationConnectionAuthenticationTypes.FEDERATED
            : DatabaseIntegrationConnectionAuthenticationTypes.TEMPORARY_CREDENTIALS_WITH_IAM
    }

    // Create the connection configuration
    const connectionConfig: ConnectionConfig = {
        id: connectionId,
        type: authType,
        databaseType: 'REDSHIFT',
        connectableResourceIdentifier: resourceIdentifier,
        connectableResourceType: isServerless ? 'WORKGROUP' : 'CLUSTER',
        database: database,
    }

    // Add auth object for SECRET authentication type
    if (authType === DatabaseIntegrationConnectionAuthenticationTypes.SECRET && secretArn) {
        connectionConfig.auth = { secretArn }
    }

    return connectionConfig
}

/**
 * Client for interacting with SQL Workbench API
 */
export class SQLWorkbenchClient {
    private sqlClient: SQLWorkbench | undefined
    private static instance: SQLWorkbenchClient | undefined
    private readonly logger = getLogger('smus')

    private constructor(
        private readonly region: string,
        private readonly connectionCredentialsProvider?: ConnectionCredentialsProvider
    ) {}

    /**
     * Gets a singleton instance of the SQLWorkbenchClient
     * @returns SQLWorkbenchClient instance
     */
    public static getInstance(region: string): SQLWorkbenchClient {
        if (!SQLWorkbenchClient.instance) {
            SQLWorkbenchClient.instance = new SQLWorkbenchClient(region)
        }
        return SQLWorkbenchClient.instance
    }

    /**
     * Creates a new SQLWorkbenchClient instance with specific credentials
     * @param region AWS region
     * @param connectionCredentialsProvider ConnectionCredentialsProvider
     * @returns SQLWorkbenchClient instance with credentials provider
     */
    public static createWithCredentials(
        region: string,
        connectionCredentialsProvider: ConnectionCredentialsProvider
    ): SQLWorkbenchClient {
        return new SQLWorkbenchClient(region, connectionCredentialsProvider)
    }

    /**
     * Gets the AWS region
     * @returns AWS region
     */
    public getRegion(): string {
        return this.region
    }

    /**
     * Gets resources from SQL Workbench
     * @param params Request parameters
     * @returns Response containing resources and optional next token
     */
    public async getResources(params: {
        connection: ConnectionConfig
        resourceType: string
        includeChildren?: boolean
        maxItems?: number
        parents?: ParentResource[]
        pageToken?: string
        forceRefresh?: boolean
    }): Promise<GetResourcesResponse> {
        try {
            this.logger.info(`SQLWorkbenchClient: Getting resources in region ${this.region}`)

            const sqlClient = await this.getSQLClient()

            const requestParams: GetResourcesRequest = {
                connection: params.connection,
                type: params.resourceType,
                maxItems: params.maxItems || 100,
                parents: params.parents || [],
                pageToken: params.pageToken,
                forceRefresh: params.forceRefresh || true,
                accountSettings: {},
            }

            // Call the GetResources API using SDK v3 Command pattern
            const command = new GetResourcesCommand(requestParams)
            return await sqlClient.send(command)
        } catch (err) {
            this.logger.error('SQLWorkbenchClient: Failed to get resources: %s', err as Error)
            throw err
        }
    }

    /**
     * Execute a SQL query
     * @param connectionConfig Connection configuration
     * @param query SQL query to execute
     * @returns Query execution ID
     */
    public async executeQuery(connectionConfig: ConnectionConfig, query: string): Promise<string | undefined> {
        try {
            this.logger.info(`SQLWorkbenchClient: Executing query in region ${this.region}`)

            const sqlClient = await this.getSQLClient()

            const requestParams: ExecuteQueryRequest = {
                connection: connectionConfig,
                databaseType: 'REDSHIFT',
                accountSettings: {},
                executionContext: [
                    {
                        parentType: 'DATABASE',
                        parentId: connectionConfig.database || '',
                    },
                ],
                query,
                queryExecutionType: 'NO_SESSION',
                queryResponseDeliveryType: 'ASYNC',
                maxItems: 100,
                ignoreHistory: true,
                tabId: 'data_explorer',
            }

            // Call the ExecuteQuery API using SDK v3 Command pattern
            const command = new ExecuteQueryCommand(requestParams)
            const response = await sqlClient.send(command)

            // Log the response
            this.logger.info(
                `SQLWorkbenchClient: Query execution started with ID: ${response.queryExecutions?.[0]?.queryExecutionId}`
            )

            return response.queryExecutions?.[0]?.queryExecutionId
        } catch (err) {
            this.logger.error('SQLWorkbenchClient: Failed to execute query: %s', err as Error)
            throw err
        }
    }

    /**
     * Gets the SQL Workbench endpoint URL for the given region
     * @param region AWS region
     * @returns SQL Workbench endpoint URL
     */
    private getSQLWorkbenchEndpoint(region: string): string {
        return `https://api-v2.sqlworkbench.${region}.amazonaws.com`
    }

    /**
     * Gets the SQL client, initializing it if necessary
     */
    private async getSQLClient(): Promise<SQLWorkbench> {
        if (!this.sqlClient) {
            try {
                // Get the endpoint URL for the region
                const endpoint = this.getSQLWorkbenchEndpoint(this.region)
                this.logger.info(`Using SQL Workbench endpoint: ${endpoint}`)

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
                    this.sqlClient = new SQLWorkbench({
                        region: this.region,
                        endpoint: endpoint,
                        credentials: awsCredentialProvider,
                    })
                } else {
                    // Use default credentials
                    this.sqlClient = new SQLWorkbench({
                        region: this.region,
                        endpoint: endpoint,
                    })
                }

                this.logger.debug('SQLWorkbenchClient: Successfully created SQL client')
            } catch (err) {
                this.logger.error('SQLWorkbenchClient: Failed to create SQL client: %s', err as Error)
                throw err
            }
        }
        return this.sqlClient
    }
}
