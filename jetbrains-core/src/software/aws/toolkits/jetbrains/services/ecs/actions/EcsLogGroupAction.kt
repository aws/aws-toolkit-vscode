// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import icons.AwsIcons
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.checkIfLogGroupExists
import software.aws.toolkits.jetbrains.services.ecs.EcsClusterNode
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils.clusterArnToName
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class EcsLogGroupAction :
    SingleResourceNodeAction<EcsClusterNode>(message("cloudwatch.logs.view_log_streams"), null, AwsIcons.Resources.CloudWatch.LOGS),
    CoroutineScope by ApplicationThreadPoolScope("EcsLogGroupAction"),
    DumbAware {
    override fun actionPerformed(selected: EcsClusterNode, e: AnActionEvent) {
        launch {
            val project = selected.nodeProject
            val client = project.awsClient<CloudWatchLogsClient>()
            val logGroup = "/ecs/${clusterArnToName(selected.resourceArn())}"
            if (client.checkIfLogGroupExists(logGroup)) {
                val window = CloudWatchLogWindow.getInstance(project)
                window.showLogGroup(logGroup)
            } else {
                notifyError(message("ecs.service.logs.no_log_stream"))
            }
        }
    }
}
