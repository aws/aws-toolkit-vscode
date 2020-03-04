// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

/**
 * The root node of the AWS explorer tree.
 */
class AwsExplorerRootNode(private val nodeProject: Project) : AbstractTreeNode<Any>(nodeProject, Object()) {
    private val regionProvider = AwsRegionProvider.getInstance()
    private val settings = ProjectAccountSettingsManager.getInstance(nodeProject)
    private val EP_NAME = ExtensionPointName<AwsExplorerServiceNode>("aws.toolkit.explorer.serviceNode")

    override fun getChildren(): List<AwsExplorerNode<*>> = EP_NAME.extensionList
        .filter { regionProvider.isServiceSupported(settings.activeRegion, it.serviceId) }
        .map { it.buildServiceRootNode(nodeProject) }

    override fun update(presentation: PresentationData) { }
}
