// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs

import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import icons.AwsIcons
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.ecs.model.ContainerDefinition
import software.amazon.awssdk.services.ecs.model.LogDriver
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.withAwsConnection
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeActionGroup
import software.aws.toolkits.jetbrains.core.getResource
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.core.plugins.pluginIsInstalledAndEnabled
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.checkIfLogStreamExists
import software.aws.toolkits.jetbrains.services.ecs.exec.EcsExecUtils
import software.aws.toolkits.jetbrains.services.ecs.exec.OpenShellInContainerDialog
import software.aws.toolkits.jetbrains.services.ecs.exec.RunCommandDialog
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message

class ContainerActions(
    private val project: Project,
    private val container: ContainerDetails
) : ActionGroup(container.containerDefinition.name(), null, null) {

    init {
        isPopup = true
    }

    override fun getChildren(e: AnActionEvent?): Array<AnAction> = arrayOf(
        ContainerLogsAction(project, container),
        Separator.getInstance(),
        ExecuteCommandAction(project, container),
        ExecuteCommandInShellAction(project, container)
    )
}

data class ContainerDetails(val service: Service, val containerDefinition: ContainerDefinition)

class ServiceContainerActions : SingleExplorerNodeActionGroup<EcsServiceNode>("Containers") {
    override fun getChildren(selected: EcsServiceNode, e: AnActionEvent): List<AnAction> {
        val containers = try {
            selected.nodeProject.getResourceNow(EcsResources.listContainers(selected.value.taskDefinition()))
        } catch (e: Exception) {
            e.notifyError(message("ecs.run_config.container.loading.error", e.localizedMessage), selected.nodeProject)
            return emptyList()
        }

        val containerActions = containers.map {
            ContainerActions(
                selected.nodeProject,
                ContainerDetails(selected.value, it)
            )
        }

        if (containerActions.isEmpty()) {
            return emptyList()
        }

        return listOf(Separator(), Separator(message("ecs.container_actions_group.label"))) + containerActions
    }
}

@Suppress("ComponentNotRegistered")
class ContainerLogsAction(
    private val project: Project,
    private val container: ContainerDetails
) : DumbAwareAction(message("ecs.service.container_logs.action_label"), null, AwsIcons.Resources.CloudWatch.LOGS) {

    private val logConfiguration: Pair<String, String>? by lazy {
        container.containerDefinition.logConfiguration().takeIf { it.logDriver() == LogDriver.AWSLOGS }?.options()?.let {
            val group = it["awslogs-group"] ?: return@let null
            val prefix = it["awslogs-stream-prefix"] ?: return@let null
            group to prefix
        }
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        if (logConfiguration == null) {
            e.presentation.isEnabled = false
        }
    }

    override fun actionPerformed(e: AnActionEvent) {
        val (logGroup, logPrefix) = logConfiguration ?: return

        val window = CloudWatchLogWindow.getInstance(project)

        project.getResource(EcsResources.listTaskIds(container.service.clusterArn(), container.service.serviceArn()))
            .thenAccept { tasks ->
                runBlocking {
                    when {
                        tasks.isEmpty() -> notifyInfo(message("ecs.service.logs.no_running_tasks"))
                        tasks.size == 1 && showSingleStream(
                            window,
                            logGroup,
                            "$logPrefix/${container.containerDefinition.name()}/${tasks.first()}"
                        ) -> return@runBlocking
                    }
                    window.showLogGroup(logGroup)
                }
            }
    }

    private fun showSingleStream(window: CloudWatchLogWindow, logGroup: String, logStream: String): Boolean {
        if (!project.awsClient<CloudWatchLogsClient>().checkIfLogStreamExists(logGroup, logStream)) {
            notifyInfo(message("ecs.service.logs.no_log_stream"))
            return false
        }
        runInEdt {
            window.showLogStream(logGroup, logStream)
        }
        return true
    }
}

class ExecuteCommandAction(
    private val project: Project,
    private val container: ContainerDetails
) : DumbAwareAction(message("ecs.execute_command_run"), null, null) {
    private val coroutineScope = projectCoroutineScope(project)
    override fun actionPerformed(e: AnActionEvent) {
        coroutineScope.launch {
            if (EcsExecUtils.ensureServiceIsInStableState(project, container.service)) {
                runInEdt {
                    project.withAwsConnection {
                        RunCommandDialog(project, container, it).show()
                    }
                }
            } else {
                notifyWarn(message("ecs.execute_command_run"), message("ecs.execute_command_disable_in_progress", container.service.serviceName()), project)
            }
        }
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isVisible = container.service.enableExecuteCommand() &&
            EcsExecExperiment.isEnabled()
    }
}

class ExecuteCommandInShellAction(
    private val project: Project,
    private val container: ContainerDetails
) : DumbAwareAction(message("ecs.execute_command_run_command_in_shell"), null, null) {
    private val coroutineScope = projectCoroutineScope(project)
    override fun actionPerformed(e: AnActionEvent) {
        coroutineScope.launch {
            if (EcsExecUtils.ensureServiceIsInStableState(project, container.service)) {
                runInEdt {
                    project.withAwsConnection {
                        OpenShellInContainerDialog(project, container, it).show()
                    }
                }
            } else {
                notifyWarn(
                    message("ecs.execute_command_run_command_in_shell"),
                    message("ecs.execute_command_disable_in_progress", container.service.serviceName()),
                    project
                )
            }
        }
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isVisible = container.service.enableExecuteCommand() &&
            pluginIsInstalledAndEnabled("org.jetbrains.plugins.terminal") && EcsExecExperiment.isEnabled()
    }
}
