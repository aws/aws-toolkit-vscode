/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { GlueCatalogClient } from '../../../../sagemakerunifiedstudio/shared/client/glueCatalogClient'
import { ConnectionCredentialsProvider } from '../../../../sagemakerunifiedstudio/auth/providers/connectionCredentialsProvider'
import { GlueCatalog } from '@amzn/glue-catalog-client'

describe('GlueCatalogClient', function () {
    let sandbox: sinon.SinonSandbox
    let mockGlueCatalogService: any
    let glueCatalogConstructorStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        mockGlueCatalogService = {
            getCatalogs: sandbox.stub().resolves({
                CatalogList: [
                    {
                        Name: 'test-catalog',
                        CatalogType: 'HIVE',
                        Parameters: { key1: 'value1' },
                    },
                ],
            }),
        }

        // Stub the GlueCatalog constructor
        glueCatalogConstructorStub = sandbox.stub(GlueCatalog.prototype, 'getCatalogs')
        glueCatalogConstructorStub.callsFake(mockGlueCatalogService.getCatalogs)
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
            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }

            const client = GlueCatalogClient.createWithCredentials(
                'us-east-1',
                credentialsProvider as ConnectionCredentialsProvider
            )
            assert.strictEqual(client.getRegion(), 'us-east-1')
        })
    })

    describe('getCatalogs', function () {
        it('should return catalogs successfully', async function () {
            const client = GlueCatalogClient.getInstance('us-east-1')
            const catalogs = await client.getCatalogs()

            assert.strictEqual(catalogs.catalogs.length, 1)
            assert.strictEqual(catalogs.catalogs[0].Name, 'test-catalog')
            assert.strictEqual(catalogs.catalogs[0].CatalogType, 'HIVE')
            assert.deepStrictEqual(catalogs.catalogs[0].Parameters, { key1: 'value1' })
        })

        it('should return empty array when no catalogs found', async function () {
            mockGlueCatalogService.getCatalogs.resolves({ CatalogList: [] })

            const client = GlueCatalogClient.getInstance('us-east-1')
            const catalogs = await client.getCatalogs()

            assert.strictEqual(catalogs.catalogs.length, 0)
        })

        it('should handle API errors', async function () {
            const error = new Error('API Error')
            mockGlueCatalogService.getCatalogs.rejects(error)

            const client = GlueCatalogClient.getInstance('us-east-1')

            await assert.rejects(async () => await client.getCatalogs(), error)
        })

        it('should create client with credentials when provided', async function () {
            const credentialsProvider = {
                getCredentials: sandbox.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                    expiration: new Date('2025-12-31'),
                }),
            } as any

            const client = GlueCatalogClient.createWithCredentials('us-east-1', credentialsProvider)
            const result = await client.getCatalogs()

            // Verify the API method was called and returned expected results
            assert.ok(glueCatalogConstructorStub.called)
            assert.strictEqual(result.catalogs.length, 1)
            assert.strictEqual(client.getRegion(), 'us-east-1')
        })

        it('should handle errors when creating client with credentials', async function () {
            const credentialsProvider = {
                getCredentials: sandbox.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            } as any

            const client = GlueCatalogClient.createWithCredentials('us-east-1', credentialsProvider)

            // Make getCatalogs fail
            const error = new Error('Credentials error')
            mockGlueCatalogService.getCatalogs.rejects(error)

            await assert.rejects(async () => await client.getCatalogs(), error)
        })

        it('should create client without credentials when not provided', async function () {
            const client = GlueCatalogClient.getInstance('us-east-1')
            const result = await client.getCatalogs()

            // Verify the method was called
            assert.ok(glueCatalogConstructorStub.called)
            assert.strictEqual(result.catalogs.length, 1)
        })
    })
})
