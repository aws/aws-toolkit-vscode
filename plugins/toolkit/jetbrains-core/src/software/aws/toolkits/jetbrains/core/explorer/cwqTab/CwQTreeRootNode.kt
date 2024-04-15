// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.cwqTab

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.explorer.AwsToolkitExplorerToolWindow
import software.aws.toolkits.jetbrains.core.explorer.actions.AnActionTreeNode

// giant hack so we can compile
class CwQRootNodeProviderImpl : CwQRootNodeProvider {
    override fun create(project: Project) = CwQTreeRootNode(project)
}

class CwQTreeRootNode(private val nodeProject: Project) : AbstractTreeNode<Any>(nodeProject, Object()) {
    override fun update(presentation: PresentationData) {}

    override fun getChildren(): Collection<AbstractTreeNode<*>> {
        val actions = listOf(
            ActionManager.getInstance().getAction("aws.toolkit.cwQRootNode.installQ"),
            ActionManager.getInstance().getAction("q.learn.more"),
            AwsToolkitExplorerToolWindow.getInstance(project).amazonQTabDismissAction
        )
        return actions.mapNotNull { AnActionTreeNode(project, ToolkitPlaces.CWQ_TOOL_WINDOW, it) }
    }
}

fun isQInstalled(): Boolean = PluginManagerCore.isPluginInstalled(PluginId.getId(AwsToolkit.Q_PLUGIN_ID))
