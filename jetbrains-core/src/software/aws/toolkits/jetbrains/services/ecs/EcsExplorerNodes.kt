// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceLocationNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceParentNode
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsCloudDebugLocation
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.resources.message

class EcsParentNode(project: Project, service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = listOf(
        EcsClusterParentNode(nodeProject) /*,
        EcsTaskDefinitionsParentNode(nodeProject)
        */
    )
}

class EcsClusterParentNode(project: Project) :
    AwsExplorerNode<String>(project, message("ecs.clusters"), null),
    ResourceParentNode {

    override fun isAlwaysShowPlus(): Boolean = true

    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = AwsResourceCache.getInstance(nodeProject)
        .getResourceNow(EcsResources.LIST_CLUSTER_ARNS)
        .map { EcsClusterNode(nodeProject, it) }
}

class EcsClusterNode(project: Project, private val clusterArn: String) :
    AwsExplorerResourceNode<String>(project, EcsClient.SERVICE_NAME, clusterArn, AwsIcons.Resources.Ecs.ECS_CLUSTER),
    ResourceParentNode {

    override fun resourceType(): String = "cluster"
    override fun resourceArn(): String = clusterArn
    override fun displayName(): String = clusterArn.split("cluster/", limit = 2).last()
    override fun isAlwaysShowPlus(): Boolean = true
    override fun emptyChildrenNode(): AwsExplorerEmptyNode = AwsExplorerEmptyNode(nodeProject, message("ecs.no_services_in_cluster"))

    override fun getChildren(): List<AwsExplorerNode<*>> = super<ResourceParentNode>.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> {
        val resourceCache = AwsResourceCache.getInstance(nodeProject)
        return AwsResourceCache.getInstance(nodeProject)
            .getResourceNow(EcsResources.listServiceArns(clusterArn))
            .map { resourceCache.getResourceNow(EcsResources.describeService(clusterArn, it)) }
            .map { EcsServiceNode(nodeProject, it, clusterArn) }
    }
}

class EcsServiceNode(project: Project, private val service: Service, private val clusterArn: String) :
    AwsExplorerResourceNode<Service>(project, EcsClient.SERVICE_NAME, service, AwsIcons.Resources.Ecs.ECS_SERVICE),
    ResourceLocationNode {

    override fun resourceType() = "service"
    override fun resourceArn(): String = value.serviceArn()
    override fun displayName(): String = value.serviceName()
    override fun location() = EcsCloudDebugLocation(nodeProject, service)

    fun clusterArn(): String = clusterArn
}

class EcsTaskDefinitionsParentNode(project: Project) :
    AwsExplorerNode<String>(project, message("ecs.task_definitions"), null),
    ResourceParentNode {

    override fun isAlwaysShowPlus(): Boolean = true

    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = AwsResourceCache.getInstance(nodeProject)
        .getResourceNow(EcsResources.LIST_ACTIVE_TASK_DEFINITION_FAMILIES)
        .map { EcsTaskDefinitionNode(nodeProject, it) }
}

class EcsTaskDefinitionNode(project: Project, familyName: String) :
    AwsExplorerResourceNode<String>(project, EcsClient.SERVICE_NAME, familyName, AwsIcons.Resources.Ecs.ECS_TASK_DEFINITION) {
    override fun resourceType() = "taskDefinition"

    override fun resourceArn(): String = AwsResourceCache.getInstance(nodeProject)
        .getResourceNow(EcsResources.describeTaskDefinition(value))
        .taskDefinitionArn()

    override fun getChildren(): List<AwsExplorerResourceNode<*>> = emptyList()
}
