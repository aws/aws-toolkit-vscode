/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { AwsExplorer } from '../../awsexplorer/awsExplorer'
import { RegionNode } from '../../awsexplorer/regionNode'
import {
    DEFAULT_TEST_REGION_CODE,
    DEFAULT_TEST_REGION_NAME,
    FakeRegionProvider,
    makeFakeAwsContextWithPlaceholderIds
} from '../utilities/fakeAwsContext'

describe('AwsExplorer', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('displays region nodes with user-friendly region names', async () => {
        const awsContext = makeFakeAwsContextWithPlaceholderIds(({} as any) as AWS.Credentials)
        const regionProvider = new FakeRegionProvider()

        const awsExplorer = new AwsExplorer(awsContext, regionProvider)

        const treeNodes = await awsExplorer.getChildren()
        assert.ok(treeNodes)
        assert.strictEqual(treeNodes.length, 1, 'Expected Explorer to have one node')

        assert.ok(
            treeNodes[0] instanceof RegionNode,
            `Expected Explorer node to be RegionNode - node contents: ${JSON.stringify(treeNodes[0], undefined, 4)}`
        )
        const regionNode = treeNodes[0] as RegionNode
        assert.strictEqual(regionNode.regionCode, DEFAULT_TEST_REGION_CODE)
        assert.strictEqual(regionNode.regionName, DEFAULT_TEST_REGION_NAME)
    })

    it('refreshes when the Region Provider is updated', async () => {
        const awsContext = makeFakeAwsContextWithPlaceholderIds(({} as any) as AWS.Credentials)
        const regionProvider = new FakeRegionProvider()

        const awsExplorer = new AwsExplorer(awsContext, regionProvider)

        const refreshStub = sandbox.stub(awsExplorer, 'refresh')

        regionProvider.onRegionProviderUpdatedEmitter.fire()

        assert.ok(refreshStub.calledOnce, 'expected AWS Explorer to refresh itself')
    })
})
