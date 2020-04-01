/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import * as os from 'os'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { ext } from '../../../shared/extensionGlobals'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../../shared/utilities/iconPathUtils'

describe('LambdaFunctionNode', () => {
    const parentNode = new TestAWSTreeNode('test node')
    let testNode: LambdaFunctionNode
    let fakeFunctionConfig: Lambda.FunctionConfiguration

    before(async () => {
        setupTestIconPaths()
        fakeFunctionConfig = {
            FunctionName: 'testFunctionName',
            FunctionArn: 'testFunctionARN',
        }

        testNode = new LambdaFunctionNode(parentNode, 'someregioncode', fakeFunctionConfig)
    })

    after(async () => {
        clearTestIconPaths()
    })

    it('instantiates without issue', async () => {
        assert.ok(testNode)
    })

    it('initializes the parent node', async () => {
        assert.strictEqual(testNode.parent, parentNode, 'unexpected parent node')
    })

    it('initializes the region code', async () => {
        assert.strictEqual(testNode.regionCode, 'someregioncode')
    })

    it('initializes the label', async () => {
        assert.strictEqual(testNode.label, fakeFunctionConfig.FunctionName)
    })

    it('initializes the functionName', async () => {
        assert.strictEqual(testNode.functionName, fakeFunctionConfig.FunctionName)
    })

    it('initializes the tooltip', async () => {
        assert.strictEqual(
            testNode.tooltip,
            `${fakeFunctionConfig.FunctionName}${os.EOL}${fakeFunctionConfig.FunctionArn}`
        )
    })

    it('initializes the icon', async () => {
        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.lambda, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.lambda, 'Unexpected light icon path')
    })

    it('has no children', async () => {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.strictEqual(childNodes.length, 0, 'Expected node to have no children')
    })
})
