/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import globals from '../../shared/extensionGlobals'
import { AwsExplorer } from '../../awsexplorer/awsExplorer'
import { RegionNode } from '../../awsexplorer/regionNode'
import { ToolkitClientBuilder } from '../../shared/clients/toolkitClientBuilder'

import { FakeExtensionContext } from '../fakeExtensionContext'
import {
    DEFAULT_TEST_REGION_CODE,
    DEFAULT_TEST_REGION_NAME,
    FakeRegionProvider,
    makeFakeAwsContextWithPlaceholderIds,
} from '../utilities/fakeAwsContext'

/**
 * Used for the 'replacer' argument for the JSON.stringify call
 * Ignores the 'moreResults' property on LoadMoreNodes which contain a circular reference,
 * where the JSON.stringify call will error
 */
function ignoreMoreResultsProperty(key: any, value: any) {
    if (key === 'moreResults') {
        return undefined
    }
    return value
}

describe('AwsExplorer', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        // contingency for current Node impl: requires a client built from globals.toolkitClientBuilder.
        const clientBuilder = {
            createS3Client: sandbox.stub().returns({}),
            createEcrClient: sandbox.stub().returns({}),
            createEcsClient: sandbox.stub().returns({}),
            createCloudFormationClient: sandbox.stub().returns({}),
            createAppRunnerClient: sandbox.stub().returns({}),
            createCloudControlClient: sandbox.stub().returns({}),
            createIotClient: sandbox.stub().returns({}),
        }
        globals.toolkitClientBuilder = clientBuilder as any as ToolkitClientBuilder
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('displays region nodes with user-friendly region names', async function () {
        const awsContext = makeFakeAwsContextWithPlaceholderIds({} as any as AWS.Credentials)
        const regionProvider = new FakeRegionProvider()

        const fakeContext = new FakeExtensionContext()
        const awsExplorer = new AwsExplorer(fakeContext, awsContext, regionProvider)

        const treeNodes = await awsExplorer.getChildren()
        assert.ok(treeNodes)
        assert.strictEqual(treeNodes.length, 1, 'Expected Explorer to have one node')

        assert.ok(
            treeNodes[0] instanceof RegionNode,
            `Expected Explorer node to be RegionNode - node contents: ${JSON.stringify(
                treeNodes[0],
                ignoreMoreResultsProperty,
                4
            )}`
        )
        const regionNode = treeNodes[0] as RegionNode
        assert.strictEqual(regionNode.regionCode, DEFAULT_TEST_REGION_CODE)
        assert.strictEqual(regionNode.regionName, DEFAULT_TEST_REGION_NAME)
    })

    it('refreshes when the Region Provider is updated', async function () {
        const awsContext = makeFakeAwsContextWithPlaceholderIds({} as any as AWS.Credentials)
        const regionProvider = new FakeRegionProvider()

        const fakeContext = new FakeExtensionContext()
        const awsExplorer = new AwsExplorer(fakeContext, awsContext, regionProvider)

        const refreshStub = sandbox.stub(awsExplorer, 'refresh')

        regionProvider.onRegionProviderUpdatedEmitter.fire()

        assert.ok(refreshStub.calledOnce, 'expected AWS Explorer to refresh itself')
    })
})
