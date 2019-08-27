/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultEcsClusterServicesNode } from '../../../awsexplorer/nodes/ecsClusterServicesNode'
import { EcsClusterNode } from '../../../awsexplorer/nodes/ecsNodeInterfaces'
import { TestLogger } from '../../../shared/loggerUtils'
import { MockClusterNode } from './mockNodes'

describe('DefaultEcsClusterServicesNode', () => {

    let logger: TestLogger

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    class TestEcsClusterServicesNode extends DefaultEcsClusterServicesNode {

        public response: Map<string, string> | Error = new Map<string, string>()

        public constructor(
            public parent: EcsClusterNode
        ) {
            super(parent, (unused: string) => 'unused')
        }

        protected async getEcsServices(): Promise<Map<string, string>> {
            if (this.response instanceof Error) {
                throw this.response
            }

            return this.response
        }
    }

    it('creates a node with child EcsClusterServiceNodes in alphabetical order', async () => {
        const arn = 'arn:aws:ecs:us-east-1:123456789012:service/abc'
        const arn2 = 'arn:aws:ecs:us-east-1:123456789012:service/xyz'
        const nameArr = ['abc', 'xyz']
        const testNode = new TestEcsClusterServicesNode(
            new MockClusterNode()
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

    it('creates a node with child EcsClusterServiceNodes that mix ARN styles in alphabetical order', async () => {
        const arn = 'arn:aws:ecs:us-east-1:123456789012:service/my-cluster/abc'
        const arn2 = 'arn:aws:ecs:us-east-1:123456789012:service/xyz'
        const nameArr = ['abc', 'xyz']
        const testNode = new TestEcsClusterServicesNode(
            new MockClusterNode()
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
        const testNode = new TestEcsClusterServicesNode(
            new MockClusterNode()
        )
        testNode.response = new Error('oh nooooooo')
        const children = await testNode.getChildren()
        assert.strictEqual(children[0].contextValue, 'awsErrorNode')
    })
})
