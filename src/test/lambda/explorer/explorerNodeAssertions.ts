/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'

export function assertNodeListOnlyContainsErrorNode(nodes: AWSTreeNodeBase[]) {
    assert(nodes !== undefined)
    assert.strictEqual(nodes.length, 1, 'Unexpected node count')
    assert.ok(nodes[0] instanceof ErrorNode, 'Expected ErrorNode in the list')
}

export function assertNodeListOnlyContainsPlaceholderNode(nodes: AWSTreeNodeBase[]) {
    assert(nodes !== undefined)
    assert.strictEqual(nodes.length, 1, 'Unexpected node count')
    assert.ok(nodes[0] instanceof PlaceholderNode, 'Expected placeholder node in the list')
}
