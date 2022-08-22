// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.DumbAware
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import software.amazon.awssdk.services.apprunner.AppRunnerClient
import software.amazon.awssdk.services.apprunner.model.AppRunnerException
import software.amazon.awssdk.services.apprunner.model.ServiceStatus
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.checkIfLogStreamExists
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ApprunnerTelemetry
import software.aws.toolkits.telemetry.Result

class DeployAction : SingleResourceNodeAction<AppRunnerServiceNode>(message("apprunner.action.deploy")), DumbAware {
    override fun update(selected: AppRunnerServiceNode, e: AnActionEvent) {
        e.presentation.isVisible = selected.service.status() == ServiceStatus.RUNNING
    }

    override fun actionPerformed(selected: AppRunnerServiceNode, e: AnActionEvent) {
        val project = selected.nodeProject
        ProgressManager.getInstance().run(
            object : Task.Backgroundable(project, message("apprunner.action.deploy.starting"), false, ALWAYS_BACKGROUND) {
                override fun run(indicator: ProgressIndicator) = runBlocking {
                    deploy(selected, project.awsClient(), project.awsClient())
                }
            }
        )
    }

    internal suspend fun deploy(selected: AppRunnerServiceNode, client: AppRunnerClient, cloudwatchClient: CloudWatchLogsClient) {
        val project = selected.nodeProject
        val deployment = try {
            client.startDeployment { it.serviceArn(selected.resourceArn()) }
        } catch (e: Exception) {
            notifyError(
                project = project,
                title = message("apprunner.action.deploy.failed"),
                content = if (e is AppRunnerException) e.awsErrorDetails().errorMessage() else message("apprunner.action.deploy.failed")
            )
            LOG.error(e) { "Failed to deploy new AppRunner service revision" }
            ApprunnerTelemetry.startDeployment(project, Result.Failed)
            return
        }
        ApprunnerTelemetry.startDeployment(project, Result.Succeeded)
        val logGroup = "/aws/apprunner/${selected.service.serviceName()}/${selected.service.serviceId()}/service"
        val logStream = "deployment/${deployment.operationId()}"
        val logWindow = CloudWatchLogWindow.getInstance(project)
        // Try 15 times. If it's not made by 15 seconds, there is probably another issue, so show an error message
        repeat(15) { _ ->
            if (runCatching { cloudwatchClient.checkIfLogStreamExists(logGroup, logStream) }.getOrNull() == true) {
                LOG.info { "Found log stream for deployment $logStream" }
                logWindow.showLogStream(logGroup, logStream, streamLogs = true)
                return
            }
            delay(1000)
        }
        notifyError(
            project = project,
            content = message("apprunner.action.deploy.unableToFindLogStream", logStream)
        )
        LOG.error { "Unable to find log stream for deployment $logStream" }
    }

    private companion object {
        val LOG = getLogger<DeployAction>()
    }
}
