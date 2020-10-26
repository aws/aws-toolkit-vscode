// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.rds.RdsClient
import software.amazon.awssdk.services.rds.model.DBInstance
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.rds.resources.LIST_SUPPORTED_INSTANCES

class RdsExplorerParentNode(project: Project, service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = nodeProject.getResourceNow(LIST_SUPPORTED_INSTANCES).map {
        RdsNode(nodeProject, it)
    }
}

class RdsNode(project: Project, val dbInstance: DBInstance, private val rdsEngine: RdsEngine = dbInstance.rdsEngine()) : AwsExplorerResourceNode<String>(
    project,
    RdsClient.SERVICE_NAME,
    dbInstance.dbInstanceArn(),
    rdsEngine.icon
) {
    override fun displayName(): String = dbInstance.dbInstanceIdentifier()
    override fun resourceArn(): String = dbInstance.dbInstanceArn()
    override fun resourceType(): String = "instance"
    override fun statusText(): String? = rdsEngine.additionalInfo
}
