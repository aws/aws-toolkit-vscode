/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { StackNameNode } from '../../../../../awsService/appBuilder/explorer/nodes/deployedStack'

describe('StackNameNode', () => {
    const expectedStackName = 'myStackName'
    const expectedRegion = 'us-west-2'
    const expectedStackLink =
        'command:aws.explorer.cloudformation.showStack?%7B%22stackName%22%3A%22myStackName%22%2C%22region%22%3A%22us-west-2%22%7D'

    let stackNameNode: StackNameNode

    beforeEach(() => {
        // Create an instance of StackNameNode
        stackNameNode = new StackNameNode(expectedStackName, expectedRegion)
    })

    it('should create an instance of StackNameNode', () => {
        assert.strictEqual(stackNameNode.link, expectedStackLink)
        assert.strictEqual(stackNameNode.stackName, expectedStackName)
        assert.strictEqual(stackNameNode.regionCode, expectedRegion)
    })

    it('should return empty array when call getChildren()', async () => {
        const result = await stackNameNode.getChildren()
        assert.deepStrictEqual(result, [])
    })

    it('should return correct getTreeItem properties when call getTreeItem()', () => {
        const expectedContextValue = 'awsAppBuilderStackNode'
        const expectedLabel = `Stack: ${expectedStackName} (${expectedRegion})`
        const treeItem = stackNameNode.getTreeItem()

        assert.deepStrictEqual(treeItem.contextValue, expectedContextValue)
        assert.deepStrictEqual(treeItem.label, expectedLabel)
    })
})
