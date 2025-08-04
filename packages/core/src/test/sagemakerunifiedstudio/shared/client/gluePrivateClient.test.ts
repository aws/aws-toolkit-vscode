/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import globals from '../../../../shared/extensionGlobals'
import { GlueCatalogClient } from '../../../../sagemakerunifiedstudio/shared/client/glueCatalogClient'

describe('GlueCatalogClient', function () {
    let sandbox: sinon.SinonSandbox
    let mockGlueClient: any
    let mockSdkClientBuilder: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        mockGlueClient = {
            getCatalogs: sandbox.stub().returns({
                promise: sandbox.stub().resolves({
                    CatalogList: [
                        {
                            Name: 'test-catalog',
                            CatalogType: 'HIVE',
                            Parameters: { key1: 'value1' },
                        },
                    ],
                }),
            }),
        }

        mockSdkClientBuilder = {
            createAwsService: sandbox.stub().resolves(mockGlueClient),
        }

        sandbox.stub(globals, 'sdkClientBuilder').value(mockSdkClientBuilder)
    })

    afterEach(function () {
        sandbox.restore()
        // Reset singleton instance
        ;(GlueCatalogClient as any).instance = undefined
    })

    describe('getInstance', function () {
        it('should create singleton instance', function () {
            const client1 = GlueCatalogClient.getInstance('us-east-1')
            const client2 = GlueCatalogClient.getInstance('us-east-1')

            assert.strictEqual(client1, client2)
        })

        it('should return region correctly', function () {
            const client = GlueCatalogClient.getInstance('us-west-2')
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

            const client = GlueCatalogClient.createWithCredentials('us-east-1', credentials)
            assert.strictEqual(client.getRegion(), 'us-east-1')
        })
    })

    describe('getCatalogs', function () {
        it('should return catalogs successfully', async function () {
            const client = GlueCatalogClient.getInstance('us-east-1')
            const catalogs = await client.getCatalogs()

            assert.strictEqual(catalogs.length, 1)
            assert.strictEqual(catalogs[0].name, 'test-catalog')
            assert.strictEqual(catalogs[0].type, 'HIVE')
            assert.deepStrictEqual(catalogs[0].parameters, { key1: 'value1' })
        })

        it('should return empty array when no catalogs found', async function () {
            mockGlueClient.getCatalogs.returns({
                promise: sandbox.stub().resolves({ CatalogList: [] }),
            })

            const client = GlueCatalogClient.getInstance('us-east-1')
            const catalogs = await client.getCatalogs()

            assert.strictEqual(catalogs.length, 0)
        })

        it('should handle API errors', async function () {
            const error = new Error('API Error')
            mockGlueClient.getCatalogs.returns({
                promise: sandbox.stub().rejects(error),
            })

            const client = GlueCatalogClient.getInstance('us-east-1')

            await assert.rejects(async () => await client.getCatalogs(), error)
        })

        it('should create client with credentials when provided', async function () {
            const credentials = {
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
                sessionToken: 'test-token',
            }

            const client = GlueCatalogClient.createWithCredentials('us-east-1', credentials)
            await client.getCatalogs()

            assert.ok(mockSdkClientBuilder.createAwsService.calledOnce)
            const callArgs = mockSdkClientBuilder.createAwsService.getCall(0).args[1]
            assert.strictEqual(callArgs.credentials.accessKeyId, 'test-key')
            assert.strictEqual(callArgs.credentials.secretAccessKey, 'test-secret')
            assert.strictEqual(callArgs.credentials.sessionToken, 'test-token')
        })

        it('should create client without credentials when not provided', async function () {
            const client = GlueCatalogClient.getInstance('us-east-1')
            await client.getCatalogs()

            assert.ok(mockSdkClientBuilder.createAwsService.calledOnce)
            const callArgs = mockSdkClientBuilder.createAwsService.getCall(0).args[1]
            assert.strictEqual(callArgs.region, 'us-east-1')
            assert.ok(!callArgs.credentials)
        })
    })
})
