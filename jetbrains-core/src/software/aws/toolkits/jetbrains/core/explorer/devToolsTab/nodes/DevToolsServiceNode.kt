// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project

interface DevToolsServiceNode {
    val serviceId: String
    fun buildServiceRootNode(nodeProject: Project): AbstractTreeNode<*>
    fun enabled(): Boolean = true
}
