/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon, { SinonStub } from 'sinon'
import { DefaultDocumentDBClient, DocumentDBClient } from '../../../shared/clients/docdbClient'

describe('DefaultDocumentDBClient', function () {
    const region = 'us-west-2'

    let sdkStub: SinonStub

    beforeEach(() => {
        sdkStub = sinon.stub().resolves({
            send: sinon.stub().resolves({
                DBClusters: [],
                DBInstances: [],
            }),
            destroy: sinon.stub(),
        })
    })

    function createClient({ regionCode = region }: { regionCode?: string } = {}): DocumentDBClient {
        const client = DefaultDocumentDBClient.create(regionCode)
        client.getClient = sdkStub
        return client
    }

    describe('listClusters', function () {
        it('gets a list of clusters', async function () {
            const client = createClient()
            const result = await client.listClusters()

            assert.ok(result)
            assert.equal(0, result.length)
            assert(sdkStub.calledOnce)
        })

        it('throws an Error during listing clusters on failure', async function () {
            const client = createClient()
            client.getClient = sinon.stub().resolves({
                send: sinon.stub().throws(),
            })

            await assert.rejects(async () => await client.listClusters())
        })
    })

    describe('listInstance', function () {
        it('gets a list of instances', async function () {
            const client = createClient()
            const result = await client.listInstances()

            assert.ok(result)
            assert.equal(0, result.length)
            assert(sdkStub.calledOnce)
        })

        it('throws an Error during listing instances on failure', async function () {
            const client = createClient()
            client.getClient = sinon.stub().resolves({
                send: sinon.stub().throws(),
            })

            await assert.rejects(async () => await client.listInstances())
        })
    })

    describe('startCluster', function () {
        it('sends the correct command', async function () {
            // arrange
            const clusterId = 'test-cluster-1'
            const client = createClient()

            // act
            await client.startCluster(clusterId)

            // assert
            assert(sdkStub.calledOnce)
        })
    })

    describe('stopCluster', function () {
        it('sends the correct command', async function () {
            // arrange
            const clusterId = 'test-cluster-1'
            const client = createClient()

            // act
            await client.stopCluster(clusterId)

            // assert
            assert(sdkStub.calledOnce)
        })
    })
})
