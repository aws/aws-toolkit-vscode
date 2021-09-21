// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import icons.AwsIcons
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.checkIfLogGroupExists
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ApprunnerTelemetry

class ViewSystemLogsAction :
    SingleResourceNodeAction<AppRunnerServiceNode>(message("apprunner.view_service_log_streams"), null, AwsIcons.Resources.CloudWatch.LOGS),
    DumbAware {
    override fun actionPerformed(selected: AppRunnerServiceNode, e: AnActionEvent) {
        val scope = projectCoroutineScope(selected.nodeProject)
        scope.launch {
            try {
                viewLogGroup(selected, "service")
            } finally {
                ApprunnerTelemetry.viewServiceLogs(selected.nodeProject)
            }
        }
    }
}

class ViewApplicationLogsAction :
    SingleResourceNodeAction<AppRunnerServiceNode>(message("apprunner.view_application_log_streams"), null, AwsIcons.Resources.CloudWatch.LOGS),
    DumbAware {
    override fun actionPerformed(selected: AppRunnerServiceNode, e: AnActionEvent) {
        val scope = projectCoroutineScope(selected.nodeProject)
        scope.launch {
            try {
                viewLogGroup(selected, "application")
            } finally {
                ApprunnerTelemetry.viewApplicationLogs(selected.nodeProject)
            }
        }
    }
}

internal fun viewLogGroup(selected: AppRunnerServiceNode, logSuffix: String) {
    val project = selected.nodeProject
    val logGroup = "/aws/apprunner/${selected.service.serviceName()}/${selected.service.serviceId()}/$logSuffix"
    try {
        val client = project.awsClient<CloudWatchLogsClient>()
        if (client.checkIfLogGroupExists(logGroup)) {
            val window = CloudWatchLogWindow.getInstance(project)
            window.showLogGroup(logGroup)
        } else {
            notifyError(project = project, content = message("apprunner.view_service_log_streams.error_not_created"))
        }
    } catch (e: Exception) {
        notifyError(project = project, content = message("apprunner.view_service_log_streams.error", logGroup))
    }
}
