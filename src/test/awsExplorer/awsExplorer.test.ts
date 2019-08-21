/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AwsExplorer } from '../../awsexplorer/awsExplorer'
import { AwsContextTreeCollection } from '../../shared/awsContextTreeCollection'
import { FeatureToggle } from '../../shared/featureToggle'
import { TestLogger } from '../../shared/loggerUtils'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'
import { MockOutputChannel } from '../mockOutputChannel'
import {
    DEFAULT_TEST_REGION_CODE,
    DEFAULT_TEST_REGION_NAME,
    FakeAwsContext,
    FakeRegionProvider,
    FakeResourceFetcher
} from '../utilities/fakeAwsContext'
import { TestSettingsConfiguration } from '../utilities/testSettingsConfiguration'

describe('AwsExplorer', () => {
    let logger: TestLogger

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    it('displays region nodes with user-friendly region names', async () => {
        const awsContext = new FakeAwsContext()
        const regionProvider = new FakeRegionProvider()
        const awsContextTreeCollection = new AwsContextTreeCollection()
        const resourceFetcher = new FakeResourceFetcher()
        const featureToggle = new FeatureToggle(new TestSettingsConfiguration())
        const mockChannel = new MockOutputChannel()

        const awsExplorer = new AwsExplorer(
            awsContext,
            awsContextTreeCollection,
            regionProvider,
            resourceFetcher,
            featureToggle,
            path => {
                throw new Error('unused')
            },
            mockChannel
        )

        const treeNodesPromise = awsExplorer.getChildren()

        assert(treeNodesPromise)
        const treeNodes = await treeNodesPromise
        assert(treeNodes)
        assert.strictEqual(treeNodes.length, 1)

        const regionNode = treeNodes[0] as RegionNode
        assert(regionNode)
        assert.strictEqual(regionNode.regionCode, DEFAULT_TEST_REGION_CODE)
        assert.strictEqual(regionNode.regionName, DEFAULT_TEST_REGION_NAME)
    })
})
