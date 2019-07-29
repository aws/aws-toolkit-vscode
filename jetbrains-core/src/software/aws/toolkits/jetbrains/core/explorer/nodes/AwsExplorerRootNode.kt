// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerService
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

/**
 * The root node of the AWS explorer tree.
 */
class AwsExplorerRootNode(project: Project) : AwsExplorerNode<String>(project, "ROOT", AwsIcons.Logos.AWS) {
    private val regionProvider = AwsRegionProvider.getInstance()
    private val settings = ProjectAccountSettingsManager.getInstance(project)

    override fun getChildren(): Collection<AbstractTreeNode<String>> {
        val childrenList = mutableListOf<AbstractTreeNode<String>>()
        AwsExplorerService.values()
            .filter {
                regionProvider.isServiceSupported(settings.activeRegion, it.serviceId)
            }
            .mapTo(childrenList) { it.buildServiceRootNode(project!!) }

        return childrenList
    }
}