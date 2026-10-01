/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClustersMessage, RedshiftClient, DescribeClustersCommand } from '@aws-sdk/client-redshift'
import {
    ListDatabasesResponse,
    ListSchemasResponse,
    RedshiftDataClient,
    ListDatabasesCommand,
    ListSchemasCommand,
} from '@aws-sdk/client-redshift-data'
import {
    ListWorkgroupsResponse,
    RedshiftServerlessClient,
    ListWorkgroupsCommand,
} from '@aws-sdk/client-redshift-serverless'
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import assert = require('assert')
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../../../awsService/redshift/models/models'
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock'

const nextToken = 'testNextToken'
describe('DefaultRedshiftClient', function () {
    let defaultRedshiftClient: DefaultRedshiftClient
    let mockRedshift: AwsClientStub<RedshiftClient>
    let mockRedshiftData: AwsClientStub<RedshiftDataClient>
    let mockRedshiftServerless: AwsClientStub<RedshiftServerlessClient>
    const clusterIdentifier = 'ClusterId'
    const workgroupName = 'Workgroup'
    const dbName = 'DB'
    const dbUsername = 'User'
    const provisionedDbUserAndPasswordParams = new ConnectionParams(
        ConnectionType.TempCreds,
        dbName,
        clusterIdentifier,
        RedshiftWarehouseType.PROVISIONED,
        dbUsername
    )
    const serverlessFederatedParams = new ConnectionParams(
        ConnectionType.TempCreds,
        dbName,
        workgroupName,
        RedshiftWarehouseType.SERVERLESS
    )
    beforeEach(function () {
        mockRedshift = mockClient(RedshiftClient)
        mockRedshiftData = mockClient(RedshiftDataClient)
        mockRedshiftServerless = mockClient(RedshiftServerlessClient)
        defaultRedshiftClient = new DefaultRedshiftClient(
            'us-east-1',
            // @ts-expect-error
            () => mockRedshiftData,
            () => mockRedshift,
            () => mockRedshiftServerless
        )
    })

    afterEach(function () {
        mockRedshift.reset()
        mockRedshiftData.reset()
        mockRedshiftServerless.reset()
    })

    describe('describeProvisionedClusters', function () {
        const expectedResponse = { Clusters: [] } as ClustersMessage

        beforeEach(function () {
            mockRedshift.on(DescribeClustersCommand).resolves(expectedResponse)
        })

        it('without nextToken should not set Marker', async () => {
            const response = await defaultRedshiftClient.describeProvisionedClusters()
            const calls = mockRedshift.commandCalls(DescribeClustersCommand)
            assert.strictEqual(calls.length, 1)
            assert.deepStrictEqual(calls[0].args[0].input, { Marker: undefined, MaxRecords: 20 })
            assert.deepStrictEqual(response.Clusters, [])
        })

        it('with nextToken should set the Marker', async () => {
            const response = await defaultRedshiftClient.describeProvisionedClusters(nextToken)
            const calls = mockRedshift.commandCalls(DescribeClustersCommand)
            assert.strictEqual(calls.length, 1)
            assert.deepStrictEqual(calls[0].args[0].input, { Marker: nextToken, MaxRecords: 20 })
            assert.deepStrictEqual(response.Clusters, [])
        })
    })

    describe('listServerlessWorkgroups', function () {
        const expectedResponse = { workgroups: [] } as ListWorkgroupsResponse

        beforeEach(function () {
            mockRedshiftServerless.on(ListWorkgroupsCommand).resolves(expectedResponse)
        })

        it('without nextToken should not set nextToken in RedshiftServerless request', async () => {
            const response = await defaultRedshiftClient.listServerlessWorkgroups()
            const calls = mockRedshiftServerless.commandCalls(ListWorkgroupsCommand)
            assert.strictEqual(calls.length, 1)
            assert.deepStrictEqual(calls[0].args[0].input, { nextToken: undefined, maxResults: 20 })
            assert.deepStrictEqual(response.workgroups, [])
        })

        it('with nextToken should set nextToken in RedshiftServerless request', async () => {
            const response = await defaultRedshiftClient.listServerlessWorkgroups(nextToken)
            const calls = mockRedshiftServerless.commandCalls(ListWorkgroupsCommand)
            assert.strictEqual(calls.length, 1)
            assert.deepStrictEqual(calls[0].args[0].input, { nextToken: nextToken, maxResults: 20 })
            assert.deepStrictEqual(response.workgroups, [])
        })
    })

    describe('listDatabases', function () {
        const expectedResponse = { Databases: [] } as ListDatabasesResponse

        beforeEach(function () {
            mockRedshiftData.on(ListDatabasesCommand).resolves(expectedResponse)
        })

        it('should list databases for provisioned clusters', async () => {
            const response = await defaultRedshiftClient.listDatabases(provisionedDbUserAndPasswordParams)
            const calls = mockRedshiftData.commandCalls(ListDatabasesCommand)
            assert.strictEqual(calls.length, 1)
            const input = calls[0].args[0].input
            assert.strictEqual(input.ClusterIdentifier, clusterIdentifier)
            assert.strictEqual(input.Database, dbName)
            assert.strictEqual(input.DbUser, dbUsername)
            assert.deepStrictEqual(response.Databases, [])
        })

        it('should list databases for serverless workgroups', async () => {
            const response = await defaultRedshiftClient.listDatabases(serverlessFederatedParams)
            const calls = mockRedshiftData.commandCalls(ListDatabasesCommand)
            assert.strictEqual(calls.length, 1)
            const input = calls[0].args[0].input
            assert.strictEqual(input.WorkgroupName, workgroupName)
            assert.strictEqual(input.Database, dbName)
            assert.deepStrictEqual(response.Databases, [])
        })
    })

    describe('listSchemas', function () {
        const expectedResponse = { Schemas: [] } as ListSchemasResponse

        beforeEach(function () {
            mockRedshiftData.on(ListSchemasCommand).resolves(expectedResponse)
        })

        it('should list schemas for databases in provisioned clusters', async () => {
            const response = await defaultRedshiftClient.listSchemas(provisionedDbUserAndPasswordParams, dbName)
            const calls = mockRedshiftData.commandCalls(ListSchemasCommand)
            assert.strictEqual(calls.length, 1)
            const input = calls[0].args[0].input
            assert.strictEqual(input.ClusterIdentifier, clusterIdentifier)
            assert.strictEqual(input.Database, dbName)
            assert.strictEqual(input.DbUser, dbUsername)
            assert.deepStrictEqual(response.Schemas, [])
        })

        it('should list schemas for databases in serverless workgroups', async () => {
            const response = await defaultRedshiftClient.listSchemas(serverlessFederatedParams, dbName)
            const calls = mockRedshiftData.commandCalls(ListSchemasCommand)
            assert.strictEqual(calls.length, 1)
            const input = calls[0].args[0].input
            assert.strictEqual(input.WorkgroupName, workgroupName)
            assert.strictEqual(input.Database, dbName)
            assert.deepStrictEqual(response.Schemas, [])
        })
    })
})
