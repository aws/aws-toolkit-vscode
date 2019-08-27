/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultEcsClustersNode } from '../../../awsexplorer/nodes/ecsClustersNode'
import { EcsNode } from '../../../awsexplorer/nodes/ecsNodeInterfaces'
import { TestLogger } from '../../../shared/loggerUtils'
import { MockEcsNode } from './mockNodes'

describe('DefaultEcsClustersNode', () => {

    let logger: TestLogger

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    class TestEcsClustersNode extends DefaultEcsClustersNode {

        public response: Map<string, string> | Error = new Map<string, string>()

        public constructor(
            public parent: EcsNode
        ) {
            super(parent, (unused: string) => 'unused')
        }

        protected async getEcsClusters(): Promise<Map<string, string>> {
            if (this.response instanceof Error) {
                throw this.response
            }

            return this.response
        }
    }

    it('creates a node with child EcsClusterNodes in alphabetical order', async () => {
        const arn = 'arn:aws:ecs:us-east-1:123456789012:cluster/abc'
        const arn2 = 'arn:aws:ecs:us-east-1:123456789012:cluster/xyz'
        const nameArr = ['abc', 'xyz']
        const testNode = new TestEcsClustersNode(
            new MockEcsNode()
        )
        const map = new Map<string, string>()
        map.set(arn, arn)
        map.set(arn2, arn2)
        testNode.response = map
        const children = await testNode.getChildren()
        for (let i = 0; i < children.length; i++) {
            assert.strictEqual(children[i].label, nameArr[i])
        }
    })

    it ('handles errors', async () => {
        const testNode = new TestEcsClustersNode(
            new MockEcsNode()
        )
        testNode.response = new Error('oh nooooooo')
        const children = await testNode.getChildren()
        assert.strictEqual(children[0].contextValue, 'awsErrorNode')
    })
})
