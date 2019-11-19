/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ErrorNode } from '../../../../shared/treeview/nodes/errorNode'
import { TestAWSTreeNode } from './testAWSTreeNode'

describe('ErrorNode', () => {
    const parentNode = new TestAWSTreeNode('test parent node')
    const error = new Error('error message')
    error.name = 'myMockError'

    // Validates we tagged the node correctly
    it('initializes label and tooltip', async () => {
        const testNode = new ErrorNode(parentNode, error, 'Error loading resources')

        assert.strictEqual(testNode.label, 'Error loading resources')
        assert.strictEqual(testNode.tooltip, `${error.name}:${error.message}`)
    })

    // Validates function nodes are leaves
    it('has no children', async () => {
        const testNode = new ErrorNode(parentNode, error, `Error loading resources (${error.name})`)

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 0)
    })
})
