// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.apprunner.AppRunnerClient
import software.amazon.awssdk.services.apprunner.model.ServiceSummary
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.apprunner.resources.AppRunnerResources
import software.aws.toolkits.jetbrains.utils.toHumanReadable
import software.aws.toolkits.resources.message

class AppRunnerNode(project: Project, service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun displayName() = message("explorer.node.apprunner")
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> =
        nodeProject.getResourceNow(AppRunnerResources.LIST_SERVICES).map { AppRunnerServiceNode(nodeProject, it) }
}

class AppRunnerServiceNode(
    project: Project,
    val service: ServiceSummary
) : AwsExplorerResourceNode<String>(
    project,
    AppRunnerClient.SERVICE_NAME,
    service.serviceName(),
    AwsIcons.Resources.APPRUNNER_SERVICE
) {
    override fun resourceType(): String = "service"
    override fun resourceArn(): String = service.serviceArn()
    override fun statusText(): String = service.status().toString().toHumanReadable()

    override fun isAlwaysShowPlus(): Boolean = false
    override fun isAlwaysLeaf(): Boolean = true
}
