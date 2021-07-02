/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ErrorNode } from '../../../../shared/treeview/nodes/errorNode'
import { TestAWSTreeNode } from './testAWSTreeNode'

describe('ErrorNode', function () {
    const parentNode = new TestAWSTreeNode('test parent node')
    const error = new Error('error message')
    error.name = 'myMockError'

    // Validates we tagged the node correctly
    it('initializes label and tooltip', async function () {
        const testNode = new ErrorNode(parentNode, error)

        assert.strictEqual(testNode.label, `Failed to load resources (click for logs)`)
        assert.strictEqual(testNode.tooltip, `${error.name}: ${error.message}`)
    })

    // Validates function nodes are leaves
    it('has no children', async function () {
        const testNode = new ErrorNode(parentNode, error)

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 0)
    })

    // Validates that a command is set
    it('command is set', async function () {
        const testNode = new ErrorNode(parentNode, error)

        assert.notStrictEqual(testNode.command, undefined)
        assert.strictEqual(testNode.command!.command, 'aws.viewLogsAtMessage')
    })
})
