/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeployedResource } from '../../awsService/appBuilder/explorer/nodes/deployedNode'
import { AWSResourceNode } from '../treeview/nodes/awsResourceNode'
import { isTreeNode, TreeNode } from '../treeview/resourceTreeDataProvider'

export function getSourceNode<T>(sourceNode: TreeNode | AWSResourceNode): T {
    if (isTreeNode(sourceNode)) {
        const resource = sourceNode.resource as DeployedResource
        return resource.explorerNode as T
    } else {
        return sourceNode as T
    }
}
