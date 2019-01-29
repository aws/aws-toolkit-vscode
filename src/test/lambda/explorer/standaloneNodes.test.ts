/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import { DefaultRegionNode } from '../../../lambda/explorer/defaultRegionNode'
import { ErrorNode } from '../../../lambda/explorer/errorNode'
import {
    DefaultStandaloneFunctionGroupNode,
    DefaultStandaloneFunctionNode
} from '../../../lambda/explorer/standaloneNodes'
import { ext } from '../../../shared/extensionGlobals'
import { RegionInfo } from '../../../shared/regions/regionInfo'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('DefaultStandaloneFunctionNode', () => {

    let fakeFunctionConfig: Lambda.FunctionConfiguration

    class FakeExtensionContextOverride extends FakeExtensionContext {

        public asAbsolutePath(relativePath: string): string {
            return relativePath
        }
    }

    before(() => {
        ext.context = new FakeExtensionContextOverride()
        fakeFunctionConfig = {
            FunctionName: 'testFunctionName',
            FunctionArn: 'testFunctionARN'
        }
    })

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {
        const testNode = new DefaultStandaloneFunctionNode(
            new DefaultStandaloneFunctionGroupNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeFunctionConfig
        )

        assert.strictEqual(testNode.label, fakeFunctionConfig.FunctionName)
        assert.strictEqual(testNode.tooltip, `${fakeFunctionConfig.FunctionName}-${fakeFunctionConfig.FunctionArn}`)
    })

    // Validates we don't yield some unexpected value that our command triggers
    // don't recognize
    it('returns expected context value', async () => {
        const testNode = new DefaultStandaloneFunctionNode(
            new DefaultStandaloneFunctionGroupNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeFunctionConfig
        )

        assert.strictEqual(testNode.contextValue, 'awsRegionFunctionNode')
    })

    // Validates function nodes are leaves
    it('has no children', async () => {
        const testNode = new DefaultStandaloneFunctionNode(
            new DefaultStandaloneFunctionGroupNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeFunctionConfig
        )

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 0)
    })

})

describe('DefaultStandaloneFunctionGroupNode', () => {

    class ThrowErrorDefaultStandaloneFunctionGroupNode extends DefaultStandaloneFunctionGroupNode {
        public constructor(
            public readonly parent: DefaultRegionNode
        ) {
            super(parent)
        }

        public async updateChildren(): Promise<void> {
            throw new Error('Hello there!')
        }
    }

    it('handles error', async () => {
        const testNode = new ThrowErrorDefaultStandaloneFunctionGroupNode(
            new DefaultRegionNode(new RegionInfo('code', 'name')))

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ErrorNode, true)
    })
})
