// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogsNode
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.resources.message

class DeleteGroupAction : DeleteResourceAction<CloudWatchLogsNode>(message("cloudwatch.logs.delete_log_group"), TaggingResourceType.CLOUDWATCHLOGS_GROUP) {
    override fun performDelete(selected: CloudWatchLogsNode) {
        val client: CloudWatchLogsClient = AwsClientManager.getInstance(selected.nodeProject).getClient()

        CloudWatchLogWindow.getInstance(selected.nodeProject)?.closeLogGroup(selected.logGroupName)

        client.deleteLogGroup { it.logGroupName(selected.logGroupName) }
        selected.nodeProject.refreshAwsTree(CloudWatchResources.LIST_LOG_GROUPS)
    }
}
