// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.AbstractActionTreeNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import java.awt.event.MouseEvent
import javax.swing.Icon

abstract class CodeWhispererActionNode(
    project: Project,
    actionName: String,
    private val actionId: String,
    val order: Int,
    icon: Icon
) : AbstractActionTreeNode(
    project,
    actionName,
    icon
) {
    private val nodeProject
        get() = myProject

    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()

    override fun onDoubleClick(event: MouseEvent) {
        CodeWhispererExplorerActionManager.getInstance().performAction(nodeProject, actionId)
    }
}
