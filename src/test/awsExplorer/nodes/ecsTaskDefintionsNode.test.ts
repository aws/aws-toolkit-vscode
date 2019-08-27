/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EcsNode } from '../../../awsexplorer/nodes/ecsNodeInterfaces'
import { DefaultEcsTaskDefinitionsNode } from '../../../awsexplorer/nodes/ecsTaskDefinitionsNode'
import { TestLogger } from '../../../shared/loggerUtils'
import { MockEcsNode } from './mockNodes'

describe('DefaultEcsTaskDefinitionsNode', () => {

    let logger: TestLogger

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    class TestEcsTaskDefinitionsNode extends DefaultEcsTaskDefinitionsNode {

        public response: Map<string, string> | Error = new Map<string, string>()

        public constructor(
            public parent: EcsNode
        ) {
            super(parent, (unused: string) => 'unused')
        }

        protected async getEcsTaskDefinitions(): Promise<Map<string, string>> {
            if (this.response instanceof Error) {
                throw this.response
            }

            return this.response
        }
    }

    it('creates a node with child EcsClusterNodes in alphabetical order', async () => {
        const name = 'abc'
        const name2 = 'xyz'
        const name3 = 'jkl'
        const nameArr = ['abc', 'jkl', 'xyz']
        const testNode = new TestEcsTaskDefinitionsNode(
            new MockEcsNode()
        )
        const map = new Map<string, string>()
        map.set(name, name)
        map.set(name2, name2)
        map.set(name3, name3)
        testNode.response = map
        const children = await testNode.getChildren()
        for (let i = 0; i < children.length; i++) {
            assert.strictEqual(children[i].label, nameArr[i])
        }
    })

    it ('handles errors', async () => {
        const testNode = new TestEcsTaskDefinitionsNode(
            new MockEcsNode()
        )
        testNode.response = new Error('oh nooooooo')
        const children = await testNode.getChildren()
        assert.strictEqual(children[0].contextValue, 'awsErrorNode')
    })
})
