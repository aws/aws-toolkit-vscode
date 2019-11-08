/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'

export function assertChildNodesOnlyContainErrorNode(childNodes: AWSTreeNodeBase[]) {
    assert(childNodes !== undefined)
    assert.strictEqual(childNodes.length, 1)
    assert.ok(childNodes[0] instanceof ErrorNode, 'Expected ErrorNode as child')
}
