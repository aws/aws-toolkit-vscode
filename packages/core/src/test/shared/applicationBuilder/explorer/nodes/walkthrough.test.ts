/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { WalkthroughNode } from '../../../../../awsService/appBuilder/explorer/nodes/walkthroughNode'

describe('WalkthroughNode', () => {
    let walkthroughNode: WalkthroughNode

    // Initialize a new instance before each test to ensure test isolation
    beforeEach(() => {
        walkthroughNode = new WalkthroughNode()
    })
    describe('constructor', () => {
        it('should create a WalkthroughNode with correct properties', () => {
            assert.strictEqual(walkthroughNode.id, 'walkthrough')
            assert.strictEqual(walkthroughNode.resource, walkthroughNode)
        })
    })
    describe('getTreeItem', () => {
        it('should generate correct TreeItem', () => {
            const treeItem = walkthroughNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Walkthrough of Application Builder')
            assert.strictEqual(treeItem.contextValue, 'awsWalkthroughNode')
            assert.deepStrictEqual(treeItem.command, {
                title: 'Walkthrough of Application Builder',
                command: 'aws.toolkit.lambda.openWalkthrough',
            })
        })
    })
})
