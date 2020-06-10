// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.rds.RdsClient
import software.amazon.awssdk.services.rds.model.DBInstance
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.CacheBackedAwsExplorerServiceRootNode
import software.aws.toolkits.resources.message
import javax.swing.Icon

class RdsExplorerParentNode(project: Project, private val service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = listOf(
        RdsParentNode(nodeProject, service, message("rds.mysql"), AllIcons.Providers.Mysql, RdsResources.LIST_INSTANCES_MYSQL),
        RdsParentNode(nodeProject, service, message("rds.postgres"), AllIcons.Providers.Postgresql, RdsResources.LIST_INSTANCES_POSTGRES)
    )
}

class RdsParentNode(
    project: Project,
    service: AwsExplorerServiceNode,
    private val type: String,
    private val childIcon: Icon,
    method: Resource.Cached<List<DBInstance>>
) : CacheBackedAwsExplorerServiceRootNode<DBInstance>(project, service, method) {
    override fun toNode(child: DBInstance): AwsExplorerNode<*> = RdsNode(nodeProject, childIcon, child)
    override fun displayName(): String = type
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
