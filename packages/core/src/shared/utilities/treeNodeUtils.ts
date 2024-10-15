/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeployedResource } from '../../awsService/appBuilder/explorer/nodes/deployedNode'
import { TreeNode } from '../treeview/resourceTreeDataProvider'

export function getSourceNode<T>(sourceNode: TreeNode): T {
    const resource = sourceNode.resource as DeployedResource
    return resource.explorerNode as T
}
