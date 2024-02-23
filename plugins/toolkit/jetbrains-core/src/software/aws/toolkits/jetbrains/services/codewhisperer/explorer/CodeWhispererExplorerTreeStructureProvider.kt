// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.ide.util.treeView.AbstractTreeNode
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.DevToolsTreeStructureProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.CodeWhispererActionNode

class CodeWhispererExplorerTreeStructureProvider : DevToolsTreeStructureProvider() {
    override fun modify(parent: AbstractTreeNode<*>, children: MutableCollection<AbstractTreeNode<*>>): MutableCollection<AbstractTreeNode<*>> =
        when (parent) {
            is CodeWhispererServiceNode ->
                children
                    .sortedWith { x, y ->
                        val order1 = (x as? CodeWhispererActionNode)?.order ?: Int.MAX_VALUE
                        val order2 = (y as? CodeWhispererActionNode)?.order ?: Int.MAX_VALUE
                        order1.compareTo(order2)
                    }.toMutableList()
            else -> children
        }
}
