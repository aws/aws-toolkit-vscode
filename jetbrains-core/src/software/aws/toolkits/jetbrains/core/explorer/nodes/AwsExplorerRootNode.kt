// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager

/**
 * The root node of the AWS explorer tree.
 */
class AwsExplorerRootNode(private val nodeProject: Project) : AbstractTreeNode<Any>(nodeProject, Object()) {
    override fun getChildren(): List<AwsExplorerNode<*>> {
        val settings = AwsConnectionManager.getInstance(nodeProject)
        val region = settings.selectedRegion ?: return emptyList()

        return EP_NAME.extensionList
            .filter { it.enabled(region) }
            .map { it.buildServiceRootNode(nodeProject) }
    }

    override fun update(presentation: PresentationData) {}

    companion object {
        private val EP_NAME = ExtensionPointName<AwsExplorerServiceNode>("aws.toolkit.explorer.serviceNode")
    }
}
