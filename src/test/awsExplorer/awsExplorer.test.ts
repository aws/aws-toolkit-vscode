/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { AwsExplorer } from '../../awsexplorer/awsExplorer'
import { RegionNode } from '../../awsexplorer/regionNode'
import { EndpointsProvider } from '../../shared/regions/endpointsProvider'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { FakeExtensionContext, FakeMemento } from '../fakeExtensionContext'
import {
    createTestRegionProvider,
    DEFAULT_TEST_REGION_CODE,
    DEFAULT_TEST_REGION_NAME,
} from '../shared/regions/testUtil'
import { createTestAuth } from '../testUtil'
import { stub } from '../utilities/stubber'

describe('AwsExplorer', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('displays region nodes with user-friendly region names', async function () {
        const auth = await createTestAuth()
        const regionProvider = createTestRegionProvider({ auth, globalState: new FakeMemento() })
        await regionProvider.updateExplorerRegions([DEFAULT_TEST_REGION_CODE])

        const fakeContext = await FakeExtensionContext.create()
        const awsExplorer = new AwsExplorer(fakeContext, regionProvider, auth)

        const treeNodes = await awsExplorer.getChildren()
        assert.ok(treeNodes)
        assert.strictEqual(treeNodes.length, 2, 'Expected Explorer to have two nodes')

        assert.ok(treeNodes[1] instanceof RegionNode, 'Expected second node to be RegionNode')
        const regionNode = treeNodes[1] as RegionNode
        assert.strictEqual(regionNode.regionCode, DEFAULT_TEST_REGION_CODE)
        assert.strictEqual(regionNode.regionName, DEFAULT_TEST_REGION_NAME)
    })

    it('refreshes when the Region Provider is updated', async function () {
        const fakeContext = await FakeExtensionContext.create()
        const endpointsProvider = stub(EndpointsProvider)
        endpointsProvider.load.resolves({ partitions: [] })

        const regionProvider = RegionProvider.fromEndpointsProvider(endpointsProvider)
        const awsExplorer = new AwsExplorer(fakeContext, regionProvider)

        const refreshStub = sandbox.stub(awsExplorer, 'refresh')
        await endpointsProvider.load()

        assert.ok(refreshStub.calledOnce, 'expected AWS Explorer to refresh itself')
    })
})
