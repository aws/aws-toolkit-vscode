/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { CdkErrorNode } from '../../../cdk/explorer/nodes/errorNode'

describe('CdkErrorNode', () => {
    const label = '[no projects]'
    const tooltip = 'we will integrate this with the CLI to create an app!'

    it('initializes label and tooltip', async () => {
        const testNode = new CdkErrorNode(label, tooltip)

        assert.strictEqual(testNode.label, label)
        assert.strictEqual(testNode.tooltip, tooltip)
        assert.strictEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.None)
    })

    it('has no children', async () => {
        const testNode = new CdkErrorNode(label, tooltip)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 0)
    })
})
