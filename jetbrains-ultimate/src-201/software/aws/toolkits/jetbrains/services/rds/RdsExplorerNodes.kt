// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.rds.RdsClient
import software.amazon.awssdk.services.rds.model.DBInstance
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceParentNode
import software.aws.toolkits.resources.message
import javax.swing.Icon

class RdsExplorerParentNode(project: Project, private val service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = listOf(
        RdsParentNode(nodeProject, message("rds.mysql"), AllIcons.Providers.Mysql, RdsResources.LIST_INSTANCES_MYSQL),
        RdsParentNode(nodeProject, message("rds.postgres"), AllIcons.Providers.Postgresql, RdsResources.LIST_INSTANCES_POSTGRES)
    )
}

class RdsParentNode(
    project: Project,
    type: String,
    private val childIcon: Icon,
    private val method: Resource.Cached<List<DBInstance>>
) : AwsExplorerNode<String>(project, type, null), ResourceParentNode {
    override fun isAlwaysShowPlus(): Boolean = true
    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = AwsResourceCache.getInstance(nodeProject)
        .getResourceNow(method)
        .map { RdsNode(nodeProject, childIcon, it) }
}

class RdsNode(project: Project, icon: Icon, val dbInstance: DBInstance) : AwsExplorerResourceNode<String>(
    project,
    RdsClient.SERVICE_NAME,
    dbInstance.dbInstanceArn(),
    icon
) {
    override fun displayName(): String = dbInstance.dbInstanceIdentifier()
    override fun resourceArn(): String = dbInstance.dbInstanceArn()
    override fun resourceType(): String = dbInstance.engine()
}
