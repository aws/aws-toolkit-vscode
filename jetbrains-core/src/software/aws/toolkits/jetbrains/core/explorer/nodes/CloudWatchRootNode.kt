// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogsServiceNode
import software.aws.toolkits.resources.message

class CloudWatchRootNode : AwsExplorerServiceNode {
    override val serviceId: String = CloudWatchLogsClient.SERVICE_NAME
    override val displayName: String = message("explorer.node.cloudwatch")

    override fun buildServiceRootNode(project: Project) = CloudWatchLogsServiceNode(project, this)
}
