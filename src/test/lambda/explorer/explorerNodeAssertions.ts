/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'

export function assertNodeListOnlyContainsErrorNode(nodes: AWSTreeNodeBase[]) {
    assert(nodes !== undefined)
    assert.strictEqual(nodes.length, 1)
    assert.ok(nodes[0] instanceof ErrorNode, 'Expected ErrorNode as child')
}
