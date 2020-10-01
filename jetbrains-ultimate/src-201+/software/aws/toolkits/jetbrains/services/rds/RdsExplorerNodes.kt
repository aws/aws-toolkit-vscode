// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.rds.RdsClient
import software.amazon.awssdk.services.rds.model.DBInstance
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceParentNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.resources.message
import javax.swing.Icon

class RdsExplorerParentNode(project: Project, private val service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = listOf(
        AuroraParentNode(nodeProject, message("rds.aurora")),
        RdsParentNode(nodeProject, message("rds.mysql"), AwsIcons.Resources.Rds.MYSQL, RdsResources.LIST_INSTANCES_MYSQL),
        RdsParentNode(nodeProject, message("rds.postgres"), AwsIcons.Resources.Rds.POSTGRES, RdsResources.LIST_INSTANCES_POSTGRES)
    )
}

class AuroraParentNode(
    project: Project,
    type: String
) : AwsExplorerNode<String>(project, type, null), ResourceParentNode {
    override fun isAlwaysShowPlus(): Boolean = true
    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = listOf(
        RdsParentNode(nodeProject, message("rds.mysql"), AwsIcons.Resources.Rds.MYSQL, RdsResources.LIST_INSTANCES_AURORA_MYSQL, aurora = true),
        RdsParentNode(nodeProject, message("rds.postgres"), AwsIcons.Resources.Rds.POSTGRES, RdsResources.LIST_INSTANCES_AURORA_POSTGRES, aurora = true)
    )
}

class RdsParentNode(
    project: Project,
    type: String,
    private val childIcon: Icon,
    private val method: Resource.Cached<List<DBInstance>>,
    private val aurora: Boolean = false
) : AwsExplorerNode<String>(project, type, null), ResourceParentNode {
    override fun isAlwaysShowPlus(): Boolean = true
    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = nodeProject
        .getResourceNow(method)
        .map {
            RdsNode(
                nodeProject,
                if (aurora) {
                    "aurora.${it.engine().getEngineFromAuroraEngine()}"
                } else {
                    it.engine()
                },
                childIcon,
                it
            )
        }
}

class RdsNode(project: Project, private val resourceType: String, icon: Icon, val dbInstance: DBInstance) : AwsExplorerResourceNode<String>(
    project,
    RdsClient.SERVICE_NAME,
    dbInstance.dbInstanceArn(),
    icon
) {
    override fun displayName(): String = dbInstance.dbInstanceIdentifier()
    override fun resourceArn(): String = dbInstance.dbInstanceArn()
    override fun resourceType(): String = resourceType
}
