// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.cwqTab

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.cwqTab.nodes.CwQServiceNode

class CwQTreeRootNode(private val nodeProject: Project) : AbstractTreeNode<Any>(nodeProject, Object()) {
    override fun update(presentation: PresentationData) {}

    override fun getChildren(): Collection<AbstractTreeNode<*>> = EP_NAME.extensionList
        .filter { it.enabled() }
        .map {
            it.buildServiceRootNode(nodeProject).also { node ->
                node.parent = this
            }
        }

    companion object {
        val EP_NAME = ExtensionPointName<CwQServiceNode>("aws.toolkit.cwq.serviceNode")
    }
}
