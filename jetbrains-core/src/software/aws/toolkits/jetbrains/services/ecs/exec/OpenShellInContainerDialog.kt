// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.execution.configurations.PtyCommandLine
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.layout.GrowPolicy
import com.intellij.ui.layout.applyToComponent
import com.intellij.ui.layout.panel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.plugins.terminal.TerminalTabState
import org.jetbrains.plugins.terminal.TerminalView
import org.jetbrains.plugins.terminal.cloud.CloudTerminalProcess
import org.jetbrains.plugins.terminal.cloud.CloudTerminalRunner
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.ecs.ContainerDetails
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.ui.resourceSelector
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcsExecuteCommandType
import software.aws.toolkits.telemetry.EcsTelemetry
import software.aws.toolkits.telemetry.Result
import javax.swing.JComponent

class OpenShellInContainerDialog(
    private val project: Project,
    private val container: ContainerDetails,
    private val connectionSettings: ConnectionSettings
) : DialogWrapper(project) {
    private val coroutineScope = projectCoroutineScope(project)
    private val shellList = listOf("/bin/bash", "/bin/sh", "/bin/zsh")
    private val shellOption = CollectionComboBoxModel(shellList)

    var task: String? = null
    var shell: String = ""

    init {
        super.init()
        title = message("ecs.execute_command_run_command_in_shell")
        setOKButtonText(message("general.execute_button"))
    }

    override fun createCenterPanel(): JComponent = panel {
        row(message("ecs.execute_command_task.label")) {
            resourceSelector(
                EcsResources.listTasks(container.service.clusterArn(), container.service.serviceArn()),
                connectionSettings,
                ::task
            ).constraints(growX, pushX)
                .growPolicy(GrowPolicy.MEDIUM_TEXT)
                .withErrorOnApplyIf(message("ecs.execute_command_task_comboBox_empty")) { it.selected().isNullOrEmpty() }
        }
        row(message("ecs.execute_command_shell.label")) {
            comboBox(shellOption, ::shell).constraints(grow)
                .withErrorOnApplyIf(message("ecs.execute_command_shell_comboBox_empty")) { it.editor.item.toString().isBlank() }
                .applyToComponent { isEditable = true }
        }
    }

    override fun doOKAction() {
        super.doOKAction()
        val task = task ?: throw IllegalStateException("Task not Selected")
        coroutineScope.launch {
            val taskRoleFound: Boolean = EcsExecUtils.checkRequiredPermissions(project, container.service.clusterArn(), task)
            if (taskRoleFound) {
                runExecCommand(task)
            } else {
                withContext(getCoroutineUiContext()) {
                    TaskRoleNotFoundWarningDialog(project).show()
                }
            }
        }
    }

    override fun doCancelAction() {
        super.doCancelAction()
        EcsTelemetry.runExecuteCommand(project, Result.Cancelled, EcsExecuteCommandType.Shell)
    }

    private fun runExecCommand(task: String) {
        try {
            val commandLine = EcsExecUtils.createCommand(project, connectionSettings, container, task, shell)
            val ptyProcess = PtyCommandLine(commandLine).createProcess()
            val process = CloudTerminalProcess(ptyProcess.outputStream, ptyProcess.inputStream)
            val runner = CloudTerminalRunner(project, container.containerDefinition.name(), process)

            runInEdt(ModalityState.any()) {
                TerminalView.getInstance(project).createNewSession(runner, TerminalTabState().also { it.myTabName = container.containerDefinition.name() })
            }
            EcsTelemetry.runExecuteCommand(project, Result.Succeeded, EcsExecuteCommandType.Shell)
        } catch (e: Exception) {
            e.notifyError(message("ecs.execute_command_failed"))
            LOG.warn(e) { "Failed to start interactive shell" }
            EcsTelemetry.runExecuteCommand(project, Result.Failed, EcsExecuteCommandType.Shell)
        }
    }
    companion object {
        private val LOG = getLogger<OpenShellInContainerDialog>()
    }
}
