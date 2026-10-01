/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { ConnectionClientStore } from '../../../../sagemakerunifiedstudio/shared/client/connectionClientStore'
import { S3Client } from '../../../../sagemakerunifiedstudio/shared/client/s3Client'
import { SQLWorkbenchClient } from '../../../../sagemakerunifiedstudio/shared/client/sqlWorkbenchClient'
import { GlueClient } from '../../../../sagemakerunifiedstudio/shared/client/glueClient'
import { GlueCatalogClient } from '../../../../sagemakerunifiedstudio/shared/client/glueCatalogClient'
import { ConnectionCredentialsProvider } from '../../../../sagemakerunifiedstudio/auth/providers/connectionCredentialsProvider'

describe('ClientStore', function () {
    let sandbox: sinon.SinonSandbox
    let clientStore: ConnectionClientStore

    const mockCredentialsProvider = {
        getCredentials: async () => ({
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
            sessionToken: 'test-token',
        }),
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        clientStore = ConnectionClientStore.getInstance()
    })

    afterEach(function () {
        sandbox.restore()
        clientStore.clearAll()
    })

    describe('getInstance', function () {
        it('should return singleton instance', function () {
            const instance1 = ConnectionClientStore.getInstance()
            const instance2 = ConnectionClientStore.getInstance()
            assert.strictEqual(instance1, instance2)
        })
    })

    describe('getClient', function () {
        it('should create and cache client', function () {
            const factory = sandbox.stub().returns({ test: 'client' })

            const client1 = clientStore.getClient('conn-1', 'TestClient', factory)
            const client2 = clientStore.getClient('conn-1', 'TestClient', factory)

            assert.strictEqual(client1, client2)
            assert.ok(factory.calledOnce)
        })

        it('should create separate clients for different connections', function () {
            const factory = sandbox.stub()
            factory.onFirstCall().returns({ test: 'client1' })
            factory.onSecondCall().returns({ test: 'client2' })

            const client1 = clientStore.getClient('conn-1', 'TestClient', factory)
            const client2 = clientStore.getClient('conn-2', 'TestClient', factory)

            assert.notStrictEqual(client1, client2)
            assert.ok(factory.calledTwice)
        })
    })

    describe('getS3Client', function () {
        it('should create S3Client with credentials provider', function () {
            sandbox.stub(S3Client.prototype, 'constructor' as any)

            const client = clientStore.getS3Client(
                'conn-1',
                'us-east-1',
                mockCredentialsProvider as ConnectionCredentialsProvider
            )

            assert.ok(client instanceof S3Client)
        })
    })

    describe('getSQLWorkbenchClient', function () {
        it('should create SQLWorkbenchClient with credentials provider', function () {
            const stub = sandbox.stub(SQLWorkbenchClient, 'createWithCredentials').returns({} as any)

            clientStore.getSQLWorkbenchClient(
                'conn-1',
                'us-east-1',
                mockCredentialsProvider as ConnectionCredentialsProvider
            )

            assert.ok(stub.calledOnce)
        })
    })

    describe('getGlueClient', function () {
        it('should create GlueClient with credentials provider', function () {
            sandbox.stub(GlueClient.prototype, 'constructor' as any)

            const client = clientStore.getGlueClient(
                'conn-1',
                'us-east-1',
                mockCredentialsProvider as ConnectionCredentialsProvider
            )

            assert.ok(client instanceof GlueClient)
        })
    })

    describe('getGlueCatalogClient', function () {
        it('should create GlueCatalogClient with credentials provider', function () {
            const stub = sandbox.stub(GlueCatalogClient, 'createWithCredentials').returns({} as any)

            clientStore.getGlueCatalogClient(
                'conn-1',
                'us-east-1',
                mockCredentialsProvider as ConnectionCredentialsProvider
            )

            assert.ok(stub.calledOnce)
        })
    })

    describe('clearConnection', function () {
        it('should clear cached clients for specific connection', function () {
            const factory = sandbox.stub().returns({ test: 'client' })

            clientStore.getClient('conn-1', 'TestClient', factory)
            clientStore.clearConnection('conn-1')
            clientStore.getClient('conn-1', 'TestClient', factory)

            assert.strictEqual(factory.callCount, 2)
        })
    })

    describe('clearAll', function () {
        it('should clear all cached clients', function () {
            const factory = sandbox.stub().returns({ test: 'client' })

            clientStore.getClient('conn-1', 'TestClient', factory)
            clientStore.clearAll()
            clientStore.getClient('conn-1', 'TestClient', factory)

            assert.strictEqual(factory.callCount, 2)
        })
    })
})
