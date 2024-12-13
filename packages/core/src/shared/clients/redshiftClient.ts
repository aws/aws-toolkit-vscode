/* eslint-disable header/header */
/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Redshift, RedshiftServerless, RedshiftData } from 'aws-sdk'
import globals from '../extensionGlobals'
import { ClusterCredentials, ClustersMessage, GetClusterCredentialsMessage } from 'aws-sdk/clients/redshift'
import {
    GetCredentialsRequest,
    GetCredentialsResponse,
    ListWorkgroupsResponse,
} from 'aws-sdk/clients/redshiftserverless'
import {
    DescribeStatementRequest,
    GetStatementResultRequest,
    GetStatementResultResponse,
    ListDatabasesResponse,
    ListSchemasResponse,
    ListTablesResponse,
} from 'aws-sdk/clients/redshiftdata'
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
        ) => Promise<RedshiftData> = createRedshiftDataClient,
        private readonly redshiftClientProvider: (regionCode: string) => Promise<Redshift> = createRedshiftSdkClient,
        private readonly redshiftServerlessClientProvider: (
            regionCode: string
        ) => Promise<RedshiftServerless> = createRedshiftServerlessSdkClient
    ) {}

    // eslint-disable-next-line require-yield
    public async describeProvisionedClusters(nextToken?: string): Promise<ClustersMessage> {
        const redshiftClient = await this.redshiftClientProvider(this.regionCode)
        const request: Redshift.DescribeClustersMessage = {
            Marker: nextToken,
            MaxRecords: 20,
        }
        const response = await redshiftClient.describeClusters(request).promise()
        if (response.Clusters) {
            response.Clusters = response.Clusters.filter(
                (cluster) => cluster.ClusterAvailabilityStatus?.toLowerCase() === 'available'
            )
        }
        return response
    }

    public async listServerlessWorkgroups(nextToken?: string): Promise<ListWorkgroupsResponse> {
        const redshiftServerlessClient = await this.redshiftServerlessClientProvider(this.regionCode)
        const request: RedshiftServerless.ListWorkgroupsRequest = {
            nextToken: nextToken,
            maxResults: 20,
        }
        const response = await redshiftServerlessClient.listWorkgroups(request).promise()
        if (response.workgroups) {
            response.workgroups = response.workgroups.filter(
                (workgroup) => workgroup.status?.toLowerCase() === 'available'
            )
        }
        return response
    }

    public async listDatabases(connectionParams: ConnectionParams, nextToken?: string): Promise<ListDatabasesResponse> {
        const redshiftDataClient = await this.redshiftDataClientProvider(this.regionCode)
        const warehouseType = connectionParams.warehouseType
        const warehouseIdentifier = connectionParams.warehouseIdentifier
        const input: RedshiftData.ListDatabasesRequest = {
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
        return redshiftDataClient.listDatabases(input).promise()
    }
    public async listSchemas(connectionParams: ConnectionParams, nextToken?: string): Promise<ListSchemasResponse> {
        const redshiftDataClient = await this.redshiftDataClientProvider(this.regionCode)
        const warehouseType = connectionParams.warehouseType
        const warehouseIdentifier = connectionParams.warehouseIdentifier
        const input: RedshiftData.ListSchemasRequest = {
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
        return redshiftDataClient.listSchemas(input).promise()
    }

    public async listTables(
        connectionParams: ConnectionParams,
        schemaName: string,
        nextToken?: string
    ): Promise<ListTablesResponse> {
        const redshiftDataClient = await this.redshiftDataClientProvider(this.regionCode)
        const warehouseType = connectionParams.warehouseType
        const warehouseIdentifier = connectionParams.warehouseIdentifier
        const input: RedshiftData.ListTablesRequest = {
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
        const ListTablesResponse = redshiftDataClient.listTables(input).promise()
        return ListTablesResponse
    }

    public async executeQuery(
        connectionParams: ConnectionParams,
        queryToExecute: string,
        nextToken?: string,
        executionId?: string
    ): Promise<ExecuteQueryResponse | undefined> {
        const redshiftData = await this.redshiftDataClientProvider(this.regionCode)
        // if executionId is not passed in, that means that we're executing and retrieving the results of the query for the first time.
        if (!executionId) {
            const execution = await redshiftData
                .executeStatement({
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
                .promise()

            executionId = execution.Id
            type Status = 'RUNNING' | 'FAILED' | 'FINISHED'
            let status: Status = 'RUNNING'
            while (status === 'RUNNING') {
                const describeStatementResponse = await redshiftData
                    .describeStatement({ Id: executionId } as DescribeStatementRequest)
                    .promise()
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
        const result = await redshiftData
            .getStatementResult({ Id: executionId, NextToken: nextToken } as GetStatementResultRequest)
            .promise()

        return { statementResultResponse: result, executionId: executionId } as ExecuteQueryResponse
    }

    public async getTempCredentials(
        warehouseType: RedshiftWarehouseType,
        connectionParams: ConnectionParams
    ): Promise<ClusterCredentials | GetCredentialsResponse> {
        if (warehouseType === RedshiftWarehouseType.PROVISIONED) {
            const redshiftClient = await this.redshiftClientProvider(this.regionCode)
            const getClusterCredentialsRequest: GetClusterCredentialsMessage = {
                DbUser: connectionParams.username!,
                DbName: connectionParams.database,
                ClusterIdentifier: connectionParams.warehouseIdentifier,
            }
            return redshiftClient.getClusterCredentials(getClusterCredentialsRequest).promise()
        } else {
            const redshiftServerless = await this.redshiftServerlessClientProvider(this.regionCode)
            const getCredentialsRequest: GetCredentialsRequest = {
                dbName: connectionParams.database,
                workgroupName: connectionParams.warehouseIdentifier,
            }
            return redshiftServerless.getCredentials(getCredentialsRequest).promise()
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

async function createRedshiftSdkClient(regionCode: string): Promise<Redshift> {
    return await globals.sdkClientBuilder.createAwsService(Redshift, { computeChecksums: true }, regionCode)
}

async function createRedshiftServerlessSdkClient(regionCode: string): Promise<RedshiftServerless> {
    return await globals.sdkClientBuilder.createAwsService(RedshiftServerless, { computeChecksums: true }, regionCode)
}
async function createRedshiftDataClient(regionCode: string): Promise<RedshiftData> {
    return await globals.sdkClientBuilder.createAwsService(RedshiftData, { computeChecksums: true }, regionCode)
}
