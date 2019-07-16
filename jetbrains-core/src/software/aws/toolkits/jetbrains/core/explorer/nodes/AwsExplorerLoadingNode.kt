// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.ide.IdeBundle
import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes

/**
 * Custom node we insert into the tree when we are loading resources and removed when the results are in
 */
class AwsExplorerLoadingNode(project: Project) : AwsExplorerNode<String>(project, IdeBundle.message("treenode.loading"), null) {

    override fun getChildren(): Collection<AbstractTreeNode<Any>> = emptyList()

    override fun update(presentation: PresentationData) {
        presentation.addText(value, SimpleTextAttributes.GRAYED_ATTRIBUTES)
    }

    override fun isAlwaysLeaf() = true
}