// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.extensions.ExtensionPointName

abstract class DevToolsTreeStructureProvider : TreeStructureProvider {
    companion object {
        val EP_NAME = ExtensionPointName<DevToolsTreeStructureProvider>("aws.toolkit.devTools.treeStructure")
    }

    final override fun modify(
        parent: AbstractTreeNode<*>,
        children: MutableCollection<AbstractTreeNode<*>>,
        settings: ViewSettings?
    ): MutableCollection<AbstractTreeNode<*>> = modify(parent, children)

    abstract fun modify(parent: AbstractTreeNode<*>, children: MutableCollection<AbstractTreeNode<*>>): MutableCollection<AbstractTreeNode<*>>
}
