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
import globals from '../../../../shared/extensionGlobals'

describe('SQLWorkbenchClient', function () {
    let sandbox: sinon.SinonSandbox
    let mockSqlClient: any
    let mockSdkClientBuilder: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        mockSqlClient = {
            getResources: sandbox.stub().returns({
                promise: sandbox.stub().resolves({
                    resources: [{ name: 'test-resource' }],
                    nextToken: 'next-token',
                }),
            }),
            executeQuery: sandbox.stub().returns({
                promise: sandbox.stub().resolves({
                    queryExecutions: [{ queryExecutionId: 'test-execution-id' }],
                }),
            }),
        }

        mockSdkClientBuilder = {
            createAwsService: sandbox.stub().resolves(mockSqlClient),
        }

        sandbox.stub(globals, 'sdkClientBuilder').value(mockSdkClientBuilder)
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
            const credentials = {
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
                sessionToken: 'test-token',
            }

            const client = SQLWorkbenchClient.createWithCredentials('us-east-1', credentials)
            assert.strictEqual(client.getRegion(), 'us-east-1')
        })
    })

    describe('getResources', function () {
        it('should get resources with connection', async function () {
            const client = SQLWorkbenchClient.getInstance('us-east-1')
            const connectionConfig = {
                id: 'test-id',
                type: 'test-type',
                databaseType: 'REDSHIFT',
                connectableResourceIdentifier: 'test-identifier',
                connectableResourceType: 'CLUSTER',
                database: 'test-db',
            }

            const result = await client.getResources({
                connection: connectionConfig,
                resourceType: 'TABLE',
                maxItems: 50,
            })

            assert.deepStrictEqual(result.resources, [{ name: 'test-resource' }])
            assert.strictEqual(result.nextToken, 'next-token')
        })

        it('should handle API errors', async function () {
            const error = new Error('API Error')
            mockSqlClient.getResources.returns({
                promise: sandbox.stub().rejects(error),
            })

            const client = SQLWorkbenchClient.getInstance('us-east-1')

            await assert.rejects(
                async () =>
                    await client.getResources({
                        connection: {
                            id: '',
                            type: '',
                            databaseType: '',
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
            const client = SQLWorkbenchClient.getInstance('us-east-1')
            const connectionConfig = {
                id: 'test-id',
                type: 'test-type',
                databaseType: 'REDSHIFT',
                connectableResourceIdentifier: 'test-identifier',
                connectableResourceType: 'CLUSTER',
                database: 'test-db',
            }

            const result = await client.executeQuery(connectionConfig, 'SELECT 1')

            assert.strictEqual(result, 'test-execution-id')
        })

        it('should handle query execution errors', async function () {
            const error = new Error('Query Error')
            mockSqlClient.executeQuery.returns({
                promise: sandbox.stub().rejects(error),
            })

            const client = SQLWorkbenchClient.getInstance('us-east-1')
            const connectionConfig = {
                id: 'test-id',
                type: 'test-type',
                databaseType: 'REDSHIFT',
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
