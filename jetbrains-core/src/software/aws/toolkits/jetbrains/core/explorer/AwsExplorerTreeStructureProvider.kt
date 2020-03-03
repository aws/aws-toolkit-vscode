// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.extensions.ExtensionPointName
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode

interface AwsExplorerTreeStructureProvider : TreeStructureProvider {
    companion object {
        val EP_NAME = ExtensionPointName<AwsExplorerTreeStructureProvider>("aws.toolkit.explorer.treeStructure")
    }

    /**
     * Runs after the [AwsExplorerNode.update] allowing for changes to the tree, like collapsing nodes
     */
    override fun modify(
        parent: AbstractTreeNode<*>,
        children: MutableCollection<AbstractTreeNode<*>>,
        settings: ViewSettings?
    ): MutableCollection<AbstractTreeNode<*>>
}
