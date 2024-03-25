// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.rds.RdsClient
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.rds.resources.LIST_SUPPORTED_CLUSTERS
import software.aws.toolkits.jetbrains.services.rds.resources.LIST_SUPPORTED_INSTANCES
import software.aws.toolkits.resources.message

class RdsExplorerParentNode(project: Project, service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun displayName(): String = message("explorer.node.rds")

    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = buildMap<String, RdsDatabase> {
        // De-dupe by db identifier
        nodeProject.getResourceNow(LIST_SUPPORTED_CLUSTERS).forEach { putIfAbsent(it.identifier, it) }
        nodeProject.getResourceNow(LIST_SUPPORTED_INSTANCES).forEach { putIfAbsent(it.identifier, it) }
    }.values.map {
        RdsNode(nodeProject, it)
    }
}

class RdsNode(project: Project, val database: RdsDatabase, private val rdsEngine: RdsEngine = database.rdsEngine()) : AwsExplorerResourceNode<String>(
    project,
    RdsClient.SERVICE_NAME,
    database.arn,
    rdsEngine.icon
) {
    override fun displayName(): String = database.identifier
    override fun resourceArn(): String = database.arn
    override fun resourceType(): String = "instance"
    override fun statusText(): String? = rdsEngine.additionalInfo
}
