// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceActionNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceParentNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.dynamic.CloudControlApiResources
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceSupportedTypes
import software.aws.toolkits.jetbrains.settings.DynamicResourcesSettings
import software.aws.toolkits.resources.message

class OtherResourcesNode(project: Project, service: AwsExplorerServiceNode) :
    AwsExplorerNode<AwsExplorerServiceNode>(project, service, null),
    ResourceParentNode,
    ResourceActionNode {

    override fun displayName(): String = message("explorer.node.other")
    override fun isAlwaysShowPlus(): Boolean = true

    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> {
        val shouldShow = DynamicResourcesSettings.getInstance().selected
        val resourcesAvailableInRegion = nodeProject.getResourceNow(CloudControlApiResources.listTypes()).toSet()

        return listOf(DynamicResourceSelectorNode(nodeProject)) + DynamicResourceSupportedTypes.getInstance().getSupportedTypes()
            .filter { it in shouldShow }
            .map { resourceType ->
                if (resourceType in resourcesAvailableInRegion) {
                    DynamicResourceResourceTypeNode(nodeProject, resourceType)
                } else {
                    UnavailableDynamicResourceTypeNode(nodeProject, resourceType)
                }
            }
    }

    override fun actionGroupName(): String = "aws.toolkit.explorer.dynamic.more.resources"
}
