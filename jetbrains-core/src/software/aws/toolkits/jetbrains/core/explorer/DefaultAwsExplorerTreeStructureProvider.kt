// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.util.treeView.AbstractTreeNode

class DefaultAwsExplorerTreeStructureProvider : AwsExplorerTreeStructureProvider() {
    // By default sort the children in alphabetical order
    override fun modify(parent: AbstractTreeNode<*>, children: MutableCollection<AbstractTreeNode<*>>): MutableCollection<AbstractTreeNode<*>> =
        children.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.toString() }).toMutableList()
}
