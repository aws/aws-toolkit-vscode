/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { AwsExplorer } from '../../awsexplorer/awsExplorer'
import { RegionNode } from '../../awsexplorer/regionNode'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { FakeExtensionContext, FakeMemento } from '../fakeExtensionContext'
import {
    createTestRegionProvider,
    DEFAULT_TEST_REGION_CODE,
    DEFAULT_TEST_REGION_NAME,
} from '../shared/regions/testUtil'
import { makeFakeAwsContextWithPlaceholderIds } from '../utilities/fakeAwsContext'

describe('AwsExplorer', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('displays region nodes with user-friendly region names', async function () {
        // TODO: add test util to set-up `Auth` in a certain way
        this.skip()

        const awsContext = makeFakeAwsContextWithPlaceholderIds({} as any as AWS.Credentials)
        const regionProvider = createTestRegionProvider({ awsContext, globalState: new FakeMemento() })
        await regionProvider.updateExplorerRegions([DEFAULT_TEST_REGION_CODE])

        const fakeContext = await FakeExtensionContext.create()
        const awsExplorer = new AwsExplorer(fakeContext, regionProvider)

        const treeNodes = await awsExplorer.getChildren()
        assert.ok(treeNodes)
        assert.strictEqual(treeNodes.length, 1, 'Expected Explorer to have one node')

        assert.ok(treeNodes[0] instanceof RegionNode, 'Expected Explorer node to be RegionNode')
        const regionNode = treeNodes[0] as RegionNode
        assert.strictEqual(regionNode.regionCode, DEFAULT_TEST_REGION_CODE)
        assert.strictEqual(regionNode.regionName, DEFAULT_TEST_REGION_NAME)
    })

    it('refreshes when the Region Provider is updated', async function () {
        const fakeContext = await FakeExtensionContext.create()
        const endpoints = Promise.resolve({ partitions: [] })
        const regionProvider = RegionProvider.fromEndpointsProvider({
            local: () => endpoints,
            remote: () => endpoints,
        })
        const awsExplorer = new AwsExplorer(fakeContext, regionProvider)
        const refreshStub = sandbox.stub(awsExplorer, 'refresh')
        await endpoints
        assert.ok(refreshStub.calledOnce, 'expected AWS Explorer to refresh itself')
    })
})
