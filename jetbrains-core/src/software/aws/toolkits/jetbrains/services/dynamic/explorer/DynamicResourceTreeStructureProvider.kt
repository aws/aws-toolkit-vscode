// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.ide.util.treeView.AbstractTreeNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerTreeStructureProvider
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerRootNode

class DynamicResourceTreeStructureProvider : AwsExplorerTreeStructureProvider() {
    override fun modify(parent: AbstractTreeNode<*>, children: MutableCollection<AbstractTreeNode<*>>): MutableCollection<AbstractTreeNode<*>> {
        if (parent !is AwsExplorerRootNode) {
            return children
        }

        val list = children.toMutableList()

        // Forces the other resources node to the end of the list
        val index = list.indexOfFirst { it is OtherResourcesNode }
        if (index >= 0) {
            list.add(list.removeAt(index))
        }

        return list
    }
}
