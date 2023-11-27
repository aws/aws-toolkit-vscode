// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.cwqTab.nodes

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project

interface CwQServiceNode {
    val serviceId: String
    fun buildServiceRootNode(nodeProject: Project): AbstractTreeNode<*>
    fun enabled(): Boolean = true
}
