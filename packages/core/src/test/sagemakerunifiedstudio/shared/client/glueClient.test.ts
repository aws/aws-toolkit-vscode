/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { GlueClient } from '../../../../sagemakerunifiedstudio/shared/client/glueClient'
import { Glue, GetDatabasesCommand, GetTablesCommand, GetTableCommand } from '@aws-sdk/client-glue'
import { ConnectionCredentialsProvider } from '../../../../sagemakerunifiedstudio/auth/providers/connectionCredentialsProvider'

describe('GlueClient', function () {
    let sandbox: sinon.SinonSandbox
    let glueClient: GlueClient
    let mockGlue: sinon.SinonStubbedInstance<Glue>

    const mockCredentialsProvider = {
        getCredentials: async () => ({
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
            sessionToken: 'test-token',
        }),
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        mockGlue = {
            send: sandbox.stub(),
        } as any

        sandbox.stub(Glue.prototype, 'send').callsFake(mockGlue.send)

        glueClient = new GlueClient('us-east-1', mockCredentialsProvider as ConnectionCredentialsProvider)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('getDatabases', function () {
        it('should get databases successfully', async function () {
            const mockResponse = {
                DatabaseList: [
                    { Name: 'database1', Description: 'Test database 1' },
                    { Name: 'database2', Description: 'Test database 2' },
                ],
                NextToken: 'next-token',
            }

            mockGlue.send.resolves(mockResponse)

            const result = await glueClient.getDatabases('test-catalog', undefined, undefined, 'start-token')

            assert.strictEqual(result.databases.length, 2)
            assert.strictEqual(result.databases[0].Name, 'database1')
            assert.strictEqual(result.nextToken, 'next-token')

            const sendCall = mockGlue.send.getCall(0)
            const command = sendCall.args[0] as GetDatabasesCommand
            assert.ok(command instanceof GetDatabasesCommand)
        })

        it('should get databases without catalog ID', async function () {
            const mockResponse = {
                DatabaseList: [{ Name: 'default-db' }],
            }

            mockGlue.send.resolves(mockResponse)

            const result = await glueClient.getDatabases()

            assert.strictEqual(result.databases.length, 1)
            assert.strictEqual(result.databases[0].Name, 'default-db')
            assert.strictEqual(result.nextToken, undefined)
        })

        it('should handle errors when getting databases', async function () {
            const error = new Error('Access denied')
            mockGlue.send.rejects(error)

            await assert.rejects(
                async () => {
                    await glueClient.getDatabases('test-catalog')
                },
                {
                    message: 'Access denied',
                }
            )
        })
    })

    describe('getTables', function () {
        it('should get tables successfully', async function () {
            const mockResponse = {
                TableList: [
                    { Name: 'table1', DatabaseName: 'test-db' },
                    { Name: 'table2', DatabaseName: 'test-db' },
                ],
                NextToken: 'next-token',
            }

            mockGlue.send.resolves(mockResponse)

            const result = await glueClient.getTables('test-db', 'test-catalog', undefined, 'start-token')

            assert.strictEqual(result.tables.length, 2)
            assert.strictEqual(result.tables[0].Name, 'table1')
            assert.strictEqual(result.nextToken, 'next-token')

            const sendCall = mockGlue.send.getCall(0)
            const command = sendCall.args[0] as GetTablesCommand
            assert.ok(command instanceof GetTablesCommand)
        })

        it('should get tables without catalog ID', async function () {
            const mockResponse = {
                TableList: [{ Name: 'default-table' }],
            }

            mockGlue.send.resolves(mockResponse)

            const result = await glueClient.getTables('test-db')

            assert.strictEqual(result.tables.length, 1)
            assert.strictEqual(result.tables[0].Name, 'default-table')
        })

        it('should handle errors when getting tables', async function () {
            const error = new Error('Database not found')
            mockGlue.send.rejects(error)

            await assert.rejects(
                async () => {
                    await glueClient.getTables('nonexistent-db')
                },
                {
                    message: 'Database not found',
                }
            )
        })
    })

    describe('getTable', function () {
        it('should get table details successfully', async function () {
            const mockResponse = {
                Table: {
                    Name: 'test-table',
                    DatabaseName: 'test-db',
                    StorageDescriptor: {
                        Columns: [
                            { Name: 'col1', Type: 'string' },
                            { Name: 'col2', Type: 'int' },
                        ],
                    },
                    PartitionKeys: [{ Name: 'partition_col', Type: 'date' }],
                },
            }

            mockGlue.send.resolves(mockResponse)

            const result = await glueClient.getTable('test-db', 'test-table', 'test-catalog')

            assert.strictEqual(result?.Name, 'test-table')
            assert.strictEqual(result?.StorageDescriptor?.Columns?.length, 2)
            assert.strictEqual(result?.PartitionKeys?.length, 1)

            const sendCall = mockGlue.send.getCall(0)
            const command = sendCall.args[0] as GetTableCommand
            assert.ok(command instanceof GetTableCommand)
        })

        it('should get table without catalog ID', async function () {
            const mockResponse = {
                Table: {
                    Name: 'default-table',
                    DatabaseName: 'default-db',
                },
            }

            mockGlue.send.resolves(mockResponse)

            const result = await glueClient.getTable('default-db', 'default-table')

            assert.strictEqual(result?.Name, 'default-table')
        })

        it('should handle errors when getting table', async function () {
            const error = new Error('Table not found')
            mockGlue.send.rejects(error)

            await assert.rejects(
                async () => {
                    await glueClient.getTable('test-db', 'nonexistent-table')
                },
                {
                    message: 'Table not found',
                }
            )
        })
    })
})
