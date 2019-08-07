// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.ide.projectView.PresentationData
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import software.aws.toolkits.resources.message

/**
 * Used when a parent node has no children. This allows us to show a message indication that there are resources for that
 * type
 */
class AwsExplorerEmptyNode(project: Project, value: String = message("explorer.empty_node")) :
    AwsExplorerNode<String>(project, value, awsIcon = null) {

    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()

    override fun update(presentation: PresentationData) {
        presentation.addText(displayName(), SimpleTextAttributes.GRAYED_ATTRIBUTES)
    }

    override fun isAlwaysLeaf() = true
}