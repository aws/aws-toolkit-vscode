// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class LambdaLogGroupAction :
    SingleExplorerNodeAction<LambdaFunctionNode>(message("lambda.logs.action_label")),
    CoroutineScope by ApplicationThreadPoolScope("LambdaLogGroupAction"),
    DumbAware {
    override fun actionPerformed(selected: LambdaFunctionNode, e: AnActionEvent) {
        launch {
            val project = selected.nodeProject
            val client = project.awsClient<CloudWatchLogsClient>()
            val logGroup = "/aws/lambda/${selected.functionName()}"
            if (client.checkIfLogGroupExists(logGroup)) {
                val window = CloudWatchLogWindow.getInstance(project)
                window.showLogGroup(logGroup)
            } else {
                notifyError(message("lambda.logs.does_not_exist"))
            }
        }
    }

    private fun CloudWatchLogsClient.checkIfLogGroupExists(logGroup: String): Boolean {
        val existingGroups = describeLogGroups { it.logGroupNamePrefix(logGroup) }
        return existingGroups.logGroups().any { it.logGroupName() == logGroup }
    }
}
