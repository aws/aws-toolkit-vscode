// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.LogGroup
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.CacheBackedAwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources

class CloudWatchLogsServiceNode(project: Project, service: AwsExplorerServiceNode) : CacheBackedAwsExplorerServiceRootNode<LogGroup>(
    project,
    service,
    CloudWatchResources.LIST_LOG_GROUPS
) {
    override fun toNode(child: LogGroup): AwsExplorerNode<*> = CloudWatchLogsNode(nodeProject, child.arn(), child.logGroupName())
}

class CloudWatchLogsNode(
    project: Project,
    val arn: String,
    val logGroupName: String
) : AwsExplorerResourceNode<String>(
    project,
    CloudWatchLogsClient.SERVICE_NAME,
    logGroupName,
    AwsIcons.Resources.CloudWatch.LOG_GROUP
) {
    override fun resourceType() = "group"

    override fun resourceArn() = arn

    override fun displayName() = logGroupName

    override fun onDoubleClick() {
        CloudWatchLogWindow.getInstance(nodeProject)?.showLogGroup(logGroupName)
    }
}
