/* eslint-disable header/header */
/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ClusterCredentials,
    ClustersMessage,
    DescribeClustersCommand,
    DescribeClustersMessage,
    GetClusterCredentialsCommand,
    GetClusterCredentialsMessage,
    RedshiftClient,
} from '@aws-sdk/client-redshift'
import {
    DescribeStatementCommand,
    DescribeStatementRequest,
    ExecuteStatementCommand,
    GetStatementResultCommand,
    GetStatementResultRequest,
    GetStatementResultResponse,
    ListDatabasesCommand,
    ListDatabasesRequest,
    ListDatabasesResponse,
    ListSchemasCommand,
    ListSchemasRequest,
    ListSchemasResponse,
    ListTablesCommand,
    ListTablesRequest,
    ListTablesResponse,
    RedshiftDataClient,
} from '@aws-sdk/client-redshift-data'
import {
    GetCredentialsCommand,
    GetCredentialsRequest,
    GetCredentialsResponse,
    ListWorkgroupsCommand,
    ListWorkgroupsRequest,
    ListWorkgroupsResponse,
    RedshiftServerlessClient,
} from '@aws-sdk/client-redshift-serverless'
import globals from '../extensionGlobals'
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../../awsService/redshift/models/models'
import { sleep } from '../utilities/timeoutUtils'
import { SecretsManagerClient } from './secretsManagerClient'
import { ToolkitError } from '../errors'
import { getLogger } from '../logger/logger'

export interface ExecuteQueryResponse {
    statementResultResponse: GetStatementResultResponse
    executionId: string
}

// Type definition for Provisioned and Serverless
export class DefaultRedshiftClient {
    public constructor(
        public readonly regionCode: string,
        private readonly redshiftDataClientProvider: (
            regionCode: string
        ) => RedshiftDataClient = createRedshiftDataClient,
        private readonly redshiftClientProvider: (regionCode: string) => RedshiftClient = createRedshiftSdkClient,
        private readonly redshiftServerlessClientProvider: (
            regionCode: string
        ) => RedshiftServerlessClient = createRedshiftServerlessSdkClient
    ) {}

    // eslint-disable-next-line require-yield
    public async describeProvisionedClusters(nextToken?: string): Promise<ClustersMessage> {
        const redshiftClient = this.redshiftClientProvider(this.regionCode)
        const request: DescribeClustersMessage = {
            Marker: nextToken,
            MaxRecords: 20,
        }
        const response = await redshiftClient.send(new DescribeClustersCommand(request))
        if (response.Clusters) {
            response.Clusters = response.Clusters.filter(
                (cluster) => cluster.ClusterAvailabilityStatus?.toLowerCase() === 'available'
            )
        }
        return response
    }

    public async listServerlessWorkgroups(nextToken?: string): Promise<ListWorkgroupsResponse> {
        const redshiftServerlessClient = this.redshiftServerlessClientProvider(this.regionCode)
        const request: ListWorkgroupsRequest = {
            nextToken: nextToken,
            maxResults: 20,
        }
        const response = await redshiftServerlessClient.send(new ListWorkgroupsCommand(request))
        if (response.workgroups) {
            response.workgroups = response.workgroups.filter(
                (workgroup) => workgroup.status?.toLowerCase() === 'available'
            )
        }
        return response
    }

    public async listDatabases(connectionParams: ConnectionParams, nextToken?: string): Promise<ListDatabasesResponse> {
        const redshiftDataClient = this.redshiftDataClientProvider(this.regionCode)
        const warehouseType = connectionParams.warehouseType
        const warehouseIdentifier = connectionParams.warehouseIdentifier
        const input: ListDatabasesRequest = {
            ClusterIdentifier: warehouseType === RedshiftWarehouseType.PROVISIONED ? warehouseIdentifier : undefined,
            Database: connectionParams.database,
            DbUser:
                warehouseType === RedshiftWarehouseType.PROVISIONED &&
                connectionParams.connectionType !== ConnectionType.DatabaseUser
                    ? connectionParams.username
                    : undefined,
            WorkgroupName: warehouseType === RedshiftWarehouseType.SERVERLESS ? warehouseIdentifier : undefined,
            NextToken: nextToken,
            SecretArn:
                connectionParams.connectionType === ConnectionType.DatabaseUser || connectionParams.secret
                    ? connectionParams.secret
                    : undefined,
        }
        return redshiftDataClient.send(new ListDatabasesCommand(input))
    }
    public async listSchemas(connectionParams: ConnectionParams, nextToken?: string): Promise<ListSchemasResponse> {
        const redshiftDataClient = this.redshiftDataClientProvider(this.regionCode)
        const warehouseType = connectionParams.warehouseType
        const warehouseIdentifier = connectionParams.warehouseIdentifier
        const input: ListSchemasRequest = {
            ClusterIdentifier: warehouseType === RedshiftWarehouseType.PROVISIONED ? warehouseIdentifier : undefined,
            Database: connectionParams.database,
            DbUser:
                connectionParams.username && connectionParams.connectionType !== ConnectionType.DatabaseUser
                    ? connectionParams.username
                    : undefined,
            WorkgroupName: warehouseType === RedshiftWarehouseType.SERVERLESS ? warehouseIdentifier : undefined,
            NextToken: nextToken,
            SecretArn:
                connectionParams.connectionType === ConnectionType.DatabaseUser || connectionParams.secret
                    ? connectionParams.secret
                    : undefined,
        }
        return redshiftDataClient.send(new ListSchemasCommand(input))
    }

    public async listTables(
        connectionParams: ConnectionParams,
        schemaName: string,
        nextToken?: string
    ): Promise<ListTablesResponse> {
        const redshiftDataClient = this.redshiftDataClientProvider(this.regionCode)
        const warehouseType = connectionParams.warehouseType
        const warehouseIdentifier = connectionParams.warehouseIdentifier
        const input: ListTablesRequest = {
            ClusterIdentifier: warehouseType === RedshiftWarehouseType.PROVISIONED ? warehouseIdentifier : undefined,
            DbUser:
                connectionParams.username && connectionParams.connectionType !== ConnectionType.DatabaseUser
                    ? connectionParams.username
                    : undefined,
            Database: connectionParams.database,
            WorkgroupName: warehouseType === RedshiftWarehouseType.SERVERLESS ? warehouseIdentifier : undefined,
            SchemaPattern: schemaName,
            NextToken: nextToken,
            SecretArn:
                connectionParams.connectionType === ConnectionType.DatabaseUser || connectionParams.secret
                    ? connectionParams.secret
                    : undefined,
        }
        const ListTablesResponse = redshiftDataClient.send(new ListTablesCommand(input))
        return ListTablesResponse
    }

    public async executeQuery(
        connectionParams: ConnectionParams,
        queryToExecute: string,
        nextToken?: string,
        executionId?: string
    ): Promise<ExecuteQueryResponse | undefined> {
        const redshiftData = this.redshiftDataClientProvider(this.regionCode)
        // if executionId is not passed in, that means that we're executing and retrieving the results of the query for the first time.
        if (!executionId) {
            const execution = await redshiftData.send(
                new ExecuteStatementCommand({
                    ClusterIdentifier:
                        connectionParams.warehouseType === RedshiftWarehouseType.PROVISIONED
                            ? connectionParams.warehouseIdentifier
                            : undefined,
                    WorkgroupName:
                        connectionParams.warehouseType === RedshiftWarehouseType.SERVERLESS
                            ? connectionParams.warehouseIdentifier
                            : undefined,
                    Database: connectionParams.database,
                    Sql: queryToExecute,
                    DbUser:
                        connectionParams.username && connectionParams.connectionType !== ConnectionType.DatabaseUser
                            ? connectionParams.username
                            : undefined,
                    SecretArn:
                        connectionParams.connectionType === ConnectionType.DatabaseUser || connectionParams.secret
                            ? connectionParams.secret
                            : undefined,
                })
            )

            executionId = execution.Id
            type Status = 'RUNNING' | 'FAILED' | 'FINISHED'
            let status: Status = 'RUNNING'
            while (status === 'RUNNING') {
                const describeStatementResponse = await redshiftData.send(
                    new DescribeStatementCommand({ Id: executionId } as DescribeStatementRequest)
                )
                if (describeStatementResponse.Status === 'FAILED' || describeStatementResponse.Status === 'FINISHED') {
                    status = describeStatementResponse.Status
                    if (status === 'FAILED') {
                        throw new Error(
                            `Failed to run query: '${queryToExecute}': '${describeStatementResponse.Error}'`
                        )
                    } else if (status === 'FINISHED' && !describeStatementResponse.HasResultSet) {
                        return undefined
                    }
                    break
                } else {
                    await sleep(1000)
                }
            }
        }
        const result = await redshiftData.send(
            new GetStatementResultCommand({ Id: executionId, NextToken: nextToken } as GetStatementResultRequest)
        )

        return { statementResultResponse: result, executionId: executionId } as ExecuteQueryResponse
    }

    public async getTempCredentials(
        warehouseType: RedshiftWarehouseType,
        connectionParams: ConnectionParams
    ): Promise<ClusterCredentials | GetCredentialsResponse> {
        if (warehouseType === RedshiftWarehouseType.PROVISIONED) {
            const redshiftClient = this.redshiftClientProvider(this.regionCode)
            const getClusterCredentialsRequest: GetClusterCredentialsMessage = {
                DbUser: connectionParams.username!,
                DbName: connectionParams.database,
                ClusterIdentifier: connectionParams.warehouseIdentifier,
            }
            return redshiftClient.send(new GetClusterCredentialsCommand(getClusterCredentialsRequest))
        } else {
            const redshiftServerless = this.redshiftServerlessClientProvider(this.regionCode)
            const getCredentialsRequest: GetCredentialsRequest = {
                dbName: connectionParams.database,
                workgroupName: connectionParams.warehouseIdentifier,
            }
            return redshiftServerless.send(new GetCredentialsCommand(getCredentialsRequest))
        }
    }
    public genUniqueId(connectionParams: ConnectionParams): string {
        const epochDate = Date.now()
        return `${epochDate}-${connectionParams.warehouseIdentifier}`
    }

    public async createSecretFromConnectionParams(connectionParams: ConnectionParams): Promise<string> {
        /*
            create a secrete arn for the username and password entered through the Database Username and Password authentication
        */
        const secretsManagerClient = new SecretsManagerClient(this.regionCode)
        const username = connectionParams.username
        const password = connectionParams.password
        if (username && password) {
            const secretString = this.genUniqueId(connectionParams)
            try {
                const response = await secretsManagerClient?.createSecret(secretString, username, password)
                if (response && response.ARN) {
                    return response.ARN
                }
                throw new ToolkitError('Secret Arn not created')
            } catch (error) {
                getLogger().error(
                    `Redshift: Error creating secret in AWS Secrets Manager - ${(error as Error).message}`
                )
                throw error
            }
        } else {
            throw new ToolkitError('Username or Password not present')
        }
    }
}

function createRedshiftSdkClient(regionCode: string): RedshiftClient {
    return globals.sdkClientBuilderV3.createAwsService({
        serviceClient: RedshiftClient,
        clientOptions: { region: regionCode },
    })
}

function createRedshiftServerlessSdkClient(regionCode: string): RedshiftServerlessClient {
    return globals.sdkClientBuilderV3.createAwsService({
        serviceClient: RedshiftServerlessClient,
        clientOptions: { region: regionCode },
    })
}
function createRedshiftDataClient(regionCode: string): RedshiftDataClient {
    return globals.sdkClientBuilderV3.createAwsService({
        serviceClient: RedshiftDataClient,
        clientOptions: { region: regionCode },
    })
}
