/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Redshift, RedshiftData, RedshiftServerless, AWSError, Request } from 'aws-sdk'
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import assert = require('assert')
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../../../redshift/models/models'
import sinon = require('sinon')

function success<T>(output?: T): Request<T, AWSError> {
    return {
        promise: () => Promise.resolve(output),
    } as Request<any, AWSError>
}

const nextToken = 'testNextToken'
describe('DefaultRedshiftClient', function () {
    let defaultRedshiftClient: DefaultRedshiftClient
    let mockRedshift: Redshift
    let mockRedshiftData: RedshiftData
    let mockRedshiftServerless: RedshiftServerless
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
    let sandbox: sinon.SinonSandbox

    before(function () {
        sandbox = sinon.createSandbox()
    })

    beforeEach(function () {
        mockRedshift = <Redshift>{}
        mockRedshiftData = <RedshiftData>{}
        mockRedshiftServerless = <RedshiftServerless>{}
        defaultRedshiftClient = new DefaultRedshiftClient(
            'us-east-1',
            async r => Promise.resolve(mockRedshiftData),
            async r => Promise.resolve(mockRedshift),
            async r => Promise.resolve(mockRedshiftServerless)
        )
    })

    describe('describeProvisionedClusters', function () {
        const expectedResponse = { Clusters: [] } as Redshift.ClustersMessage
        let describeClustersStub: sinon.SinonStub

        beforeEach(function () {
            describeClustersStub = sandbox.stub()
            mockRedshift.describeClusters = describeClustersStub
            describeClustersStub.returns(success(expectedResponse))
        })

        it('without nextToken should not set Marker', async () => {
            const response = await defaultRedshiftClient.describeProvisionedClusters()
            describeClustersStub.alwaysCalledWith({ Marker: undefined, MaxRecords: 20 })
            assert.deepStrictEqual(response.Clusters, [])
        })

        it('with nextToken should set the Marker', async () => {
            const response = await defaultRedshiftClient.describeProvisionedClusters(nextToken)
            describeClustersStub.alwaysCalledWith({ Marker: nextToken, MaxRecords: 20 })
            assert.deepStrictEqual(response.Clusters, [])
        })
    })

    describe('listServerlessWorkgroups', function () {
        const expectedResponse = { workgroups: [] } as RedshiftServerless.ListWorkgroupsResponse
        let listServerlessWorkgroupsStub: sinon.SinonStub
        beforeEach(function () {
            listServerlessWorkgroupsStub = sandbox.stub()
            mockRedshiftServerless.listWorkgroups = listServerlessWorkgroupsStub
            listServerlessWorkgroupsStub.returns(success(expectedResponse))
        })

        it('without nextToken should not set nextToken in RedshiftServerless request', async () => {
            const response = await defaultRedshiftClient.listServerlessWorkgroups()
            listServerlessWorkgroupsStub.alwaysCalledWith({ nextToken: undefined, maxResults: 20 })
            assert.deepStrictEqual(response.workgroups, [])
        })

        it('with nextToken should set nextToken in RedshiftServerless request', async () => {
            const response = await defaultRedshiftClient.listServerlessWorkgroups(nextToken)
            listServerlessWorkgroupsStub.alwaysCalledWith({ nextToken: nextToken, maxResults: 20 })
            assert.deepStrictEqual(response.workgroups, [])
        })
    })

    describe('listDatabases', function () {
        const expectedResponse = { Databases: [] } as RedshiftData.ListDatabasesResponse
        let listDatabasesStub: sinon.SinonStub
        beforeEach(function () {
            listDatabasesStub = sandbox.stub()
            mockRedshiftData.listDatabases = listDatabasesStub
            listDatabasesStub.returns(success(expectedResponse))
        })
        it('should list databases for provisioned clusters', async () => {
            const response = await defaultRedshiftClient.listDatabases(provisionedDbUserAndPasswordParams)
            listDatabasesStub.alwaysCalledWith({
                ClusterIdentifier: clusterIdentifier,
                Database: dbName,
                DbUser: dbUsername,
            })
            assert.deepStrictEqual(response.Databases, [])
        })

        it('should list databases for serverless workgroups', async () => {
            const response = await defaultRedshiftClient.listDatabases(serverlessFederatedParams)
            listDatabasesStub.alwaysCalledWith({ WorkgroupName: workgroupName, Database: dbName })
            assert.deepStrictEqual(response.Databases, [])
        })
    })

    describe('listSchemas', function () {
        const expectedResponse = { Schemas: [] } as RedshiftData.ListSchemasResponse
        let listSchemasStub: sinon.SinonStub
        beforeEach(function () {
            listSchemasStub = sandbox.stub()
            mockRedshiftData.listSchemas = listSchemasStub
            listSchemasStub.returns(success(expectedResponse))
        })

        it('should list schemas for databases in provisioned clusters', async () => {
            const response = await defaultRedshiftClient.listSchemas(provisionedDbUserAndPasswordParams, dbName)
            listSchemasStub.alwaysCalledWith({
                ClusterIdentifier: clusterIdentifier,
                Database: dbName,
                DbUser: dbUsername,
            })
            assert.deepStrictEqual(response.Schemas, [])
        })

        it('should list schemas for databases in serverless workgroups', async () => {
            const response = await defaultRedshiftClient.listSchemas(serverlessFederatedParams, dbName)
            listSchemasStub.alwaysCalledWith({ WorkgroupName: workgroupName, Database: dbName })
            assert.deepStrictEqual(response.Schemas, [])
        })
    })
})
