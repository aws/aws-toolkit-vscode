/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    SQLWorkbenchClient,
    generateSqlWorkbenchArn,
    createRedshiftConnectionConfig,
} from '../../../../sagemakerunifiedstudio/shared/client/sqlWorkbenchClient'
import { STSClient } from '@aws-sdk/client-sts'
import { ConnectionCredentialsProvider } from '../../../../sagemakerunifiedstudio/auth/providers/connectionCredentialsProvider'
import {
    DatabaseIntegrationConnectionAuthenticationTypes,
    SQLWorkbench,
    GetResourcesCommand,
    ExecuteQueryCommand,
} from '@amzn/sql-workbench-client'

describe('SQLWorkbenchClient', function () {
    let sandbox: sinon.SinonSandbox
    let sendStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Mock SDK v3 send method
        sendStub = sandbox.stub(SQLWorkbench.prototype, 'send')
    })

    afterEach(function () {
        sandbox.restore()
        // Reset singleton instance
        ;(SQLWorkbenchClient as any).instance = undefined
    })

    describe('getInstance', function () {
        it('should create singleton instance', function () {
            const client1 = SQLWorkbenchClient.getInstance('us-east-1')
            const client2 = SQLWorkbenchClient.getInstance('us-east-1')

            assert.strictEqual(client1, client2)
        })

        it('should return region correctly', function () {
            const client = SQLWorkbenchClient.getInstance('us-west-2')
            assert.strictEqual(client.getRegion(), 'us-west-2')
        })
    })

    describe('createWithCredentials', function () {
        it('should create client with credentials', function () {
            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }

            const client = SQLWorkbenchClient.createWithCredentials(
                'us-east-1',
                credentialsProvider as ConnectionCredentialsProvider
            )
            assert.strictEqual(client.getRegion(), 'us-east-1')
        })
    })

    describe('getResources', function () {
        it('should get resources with connection', async function () {
            // Mock the send method to return expected response
            sendStub.resolves({
                resources: [{ displayName: 'test-resource' }],
                nextToken: 'next-token',
            })

            const client = SQLWorkbenchClient.getInstance('us-east-1')
            const connectionConfig = {
                id: 'arn:aws:sqlworkbench:us-east-1:123456789012:connection/test-uuid-1234',
                type: DatabaseIntegrationConnectionAuthenticationTypes.FEDERATED,
                databaseType: 'REDSHIFT' as const,
                connectableResourceIdentifier: 'test-identifier',
                connectableResourceType: 'CLUSTER',
                database: 'test-db',
            }

            const result = await client.getResources({
                connection: connectionConfig,
                resourceType: 'TABLE',
                maxItems: 50,
            })

            assert.deepStrictEqual(result.resources, [{ displayName: 'test-resource' }])
            assert.strictEqual(result.nextToken, 'next-token')
            assert.ok(sendStub.calledOnce)
            assert.ok(sendStub.firstCall.args[0] instanceof GetResourcesCommand)
        })

        it('should handle API errors', async function () {
            const error = new Error('API Error')
            sendStub.rejects(error)

            const client = SQLWorkbenchClient.getInstance('us-east-1')

            await assert.rejects(
                async () =>
                    await client.getResources({
                        connection: {
                            id: 'arn:aws:sqlworkbench:us-east-1:123456789012:connection/test-uuid-1234',
                            type: DatabaseIntegrationConnectionAuthenticationTypes.FEDERATED,
                            databaseType: 'REDSHIFT' as const,
                            connectableResourceIdentifier: '',
                            connectableResourceType: '',
                            database: '',
                        },
                        resourceType: '',
                    }),
                error
            )
        })
    })

    describe('executeQuery', function () {
        it('should execute query successfully', async function () {
            // Mock the send method to return expected response
            sendStub.resolves({
                queryExecutions: [{ queryExecutionId: 'test-execution-id' }],
            })

            const client = SQLWorkbenchClient.getInstance('us-east-1')
            const connectionConfig = {
                id: 'arn:aws:sqlworkbench:us-east-1:123456789012:connection/test-uuid-1234',
                type: DatabaseIntegrationConnectionAuthenticationTypes.FEDERATED,
                databaseType: 'REDSHIFT' as const,
                connectableResourceIdentifier: 'test-identifier',
                connectableResourceType: 'CLUSTER',
                database: 'test-db',
            }

            const result = await client.executeQuery(connectionConfig, 'SELECT 1')

            assert.strictEqual(result, 'test-execution-id')
            assert.ok(sendStub.calledOnce)
            assert.ok(sendStub.firstCall.args[0] instanceof ExecuteQueryCommand)
        })

        it('should handle query execution errors', async function () {
            const error = new Error('Query Error')
            sendStub.rejects(error)

            const client = SQLWorkbenchClient.getInstance('us-east-1')
            const connectionConfig = {
                id: 'arn:aws:sqlworkbench:us-east-1:123456789012:connection/test-uuid-1234',
                type: DatabaseIntegrationConnectionAuthenticationTypes.FEDERATED,
                databaseType: 'REDSHIFT' as const,
                connectableResourceIdentifier: 'test-identifier',
                connectableResourceType: 'CLUSTER',
                database: 'test-db',
            }

            await assert.rejects(async () => await client.executeQuery(connectionConfig, 'SELECT 1'), error)
        })
    })
})

describe('generateSqlWorkbenchArn', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should generate ARN with provided account ID', async function () {
        const arn = await generateSqlWorkbenchArn('us-east-1', '123456789012')

        assert.ok(arn.startsWith('arn:aws:sqlworkbench:us-east-1:123456789012:connection/'))
        assert.ok(arn.includes('-'))
    })
})

describe('createRedshiftConnectionConfig', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        sandbox.stub(STSClient.prototype, 'send').resolves({ Account: '123456789012' })
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should create serverless connection config', async function () {
        const config = await createRedshiftConnectionConfig(
            'test-workgroup.123456789012.us-east-1.redshift-serverless.amazonaws.com',
            'test-db',
            '123456789012',
            'us-east-1',
            '',
            false
        )

        assert.strictEqual(config.databaseType, 'REDSHIFT')
        assert.strictEqual(config.connectableResourceType, 'WORKGROUP')
        assert.strictEqual(config.connectableResourceIdentifier, 'test-workgroup')
        assert.strictEqual(config.database, 'test-db')
        assert.strictEqual(config.type, '4') // FEDERATED
    })

    it('should create cluster connection config', async function () {
        const config = await createRedshiftConnectionConfig(
            'test-cluster.123456789012.us-east-1.redshift.amazonaws.com',
            'test-db',
            '123456789012',
            'us-east-1',
            '',
            false
        )

        assert.strictEqual(config.databaseType, 'REDSHIFT')
        assert.strictEqual(config.connectableResourceType, 'CLUSTER')
        assert.strictEqual(config.connectableResourceIdentifier, 'test-cluster')
        assert.strictEqual(config.database, 'test-db')
        assert.strictEqual(config.type, '5') // TEMPORARY_CREDENTIALS_WITH_IAM
    })

    it('should create config with secret authentication', async function () {
        const config = await createRedshiftConnectionConfig(
            'test-cluster.123456789012.us-east-1.redshift.amazonaws.com',
            'test-db',
            '123456789012',
            'us-east-1',
            'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret',
            false
        )

        assert.strictEqual(config.type, '6') // SECRET
        assert.ok(config.auth)
        assert.strictEqual(config.auth.secretArn, 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret')
    })
})
