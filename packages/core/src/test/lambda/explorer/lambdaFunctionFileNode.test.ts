/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import { LambdaFunctionFileNode } from '../../../lambda/explorer/lambdaFunctionFileNode'
import path from 'path'

describe('LambdaFunctionFileNode', function () {
    const fakeFunctionConfig = {
        FunctionName: 'testFunctionName',
        FunctionArn: 'testFunctionARN',
    }
    const fakeFilename = 'fakeFile'
    const fakeRegion = 'fakeRegion'
    const functionNode = new LambdaFunctionNode(new TestAWSTreeNode('test node'), fakeRegion, fakeFunctionConfig)
    const filePath = path.join(
        '/tmp/aws-toolkit-vscode/lambda',
        fakeRegion,
        fakeFunctionConfig.FunctionName,
        fakeFilename
    )

    let testNode: LambdaFunctionFileNode

    before(async function () {
        testNode = new LambdaFunctionFileNode(functionNode, fakeFilename, filePath)
    })

    it('instantiates without issue', function () {
        assert.ok(testNode)
    })

    it('initializes the parent node', function () {
        assert.equal(testNode.parent, functionNode, 'unexpected parent node')
    })

    it('initializes the label', function () {
        assert.equal(testNode.label, fakeFilename)
    })

    it('has no children', async function () {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.strictEqual(childNodes.length, 0, 'Expected zero children')
    })

    it('has correct command', function () {
        assert.deepStrictEqual(testNode.command, {
            command: 'aws.openLambdaFile',
            title: 'Open file',
            arguments: [filePath],
        })
    })
})
