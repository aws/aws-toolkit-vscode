// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.AbstractActionTreeNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import javax.swing.Icon

abstract class CodeWhispererActionNode(
    project: Project,
    actionName: String,
    val order: Int,
    icon: Icon
) : AbstractActionTreeNode(
    project,
    actionName,
    icon
) {
    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()
}
