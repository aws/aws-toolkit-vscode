/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDbInstanceNode } from '../explorer/dynamoDbInstanceNode'
import { compareTreeItems } from '../../shared/treeview/utils'

export async function sortTablesByName(node: DynamoDbInstanceNode) {
    console.log('I am trying to sort the tables by name.')

    const x = await node.getChildren()
    x.sort((a, b) => compareTreeItems(a, b))

    console.log(x)
}
