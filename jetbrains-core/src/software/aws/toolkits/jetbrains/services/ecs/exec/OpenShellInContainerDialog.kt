// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.layout.GrowPolicy
import com.intellij.ui.layout.panel
import com.pty4j.PtyProcess
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.plugins.terminal.TerminalTabState
import org.jetbrains.plugins.terminal.TerminalView
import org.jetbrains.plugins.terminal.cloud.CloudTerminalProcess
import org.jetbrains.plugins.terminal.cloud.CloudTerminalRunner
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.services.ecs.ContainerDetails
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcsExecuteCommandType
import software.aws.toolkits.telemetry.EcsTelemetry
import software.aws.toolkits.telemetry.Result
import java.lang.IllegalStateException
import javax.swing.JComponent

class OpenShellInContainerDialog(
    private val project: Project,
    private val container: ContainerDetails,
    private val environmentVariables: Map<String, String>
) : DialogWrapper(project) {
    private val coroutineScope = ApplicationThreadPoolScope("OpenShellInContainerDialog")
    private val tasks = ResourceSelector
        .builder()
        .resource(
            EcsResources.listTasks(
                container.service.clusterArn(),
                container.service.serviceArn()
            )
        )
        .awsConnection(project)
        .build()
    private val shellList = listOf("/bin/bash", "/bin/sh", "/bin/zsh")
    private val shellOption = CollectionComboBoxModel(shellList)
    private var shell = shellList.first()
    private val component by lazy {
        panel {
            row(message("ecs.execute_command_task.label")) {
                tasks(growX, pushX).growPolicy(GrowPolicy.MEDIUM_TEXT)
                    .withErrorOnApplyIf(message("ecs.execute_command_task_comboBox_empty")) { it.item.isNullOrEmpty() }
            }
            row(message("ecs.execute_command_shell.label")) {
                comboBox(
                    shellOption, { shell },
                    {
                        if (it != null) {
                            shell = it
                        }
                    }
                ).constraints(grow)
                    .withErrorOnApplyIf(message("ecs.execute_command_shell_comboBox_empty")) { it.editor.item.toString().isNullOrBlank() }
                    .also { it.component.isEditable = true }
            }
        }
    }

    init {
        super.init()
        title = message("ecs.execute_command_run_command_in_shell")
        setOKButtonText(message("general.execute_button"))
    }

    override fun createCenterPanel(): JComponent? = component

    override fun doOKAction() {
        super.doOKAction()
        val task = tasks.selected() ?: throw IllegalStateException("Task not Selected")
        coroutineScope.launch {
            val taskRoleFound: Boolean = EcsExecUtils.checkRequiredPermissions(project, container.service.clusterArn(), task)
            if (taskRoleFound) {
                runExecCommand()
            } else {
                withContext(getCoroutineUiContext(ModalityState.any())) {
                    TaskRoleNotFoundWarningDialog(project).show()
                }
            }
        }
    }

    override fun doCancelAction() {
        super.doCancelAction()
        EcsTelemetry.runExecuteCommand(project, Result.Cancelled, EcsExecuteCommandType.Shell)
    }

    private fun runExecCommand() {
        try {
            ExecutableManager.getInstance().getExecutable<AwsCliExecutable>().thenAccept { awsCliExecutable ->
                when (awsCliExecutable) {
                    is ExecutableInstance.Executable -> awsCliExecutable
                    is ExecutableInstance.UnresolvedExecutable -> throw Exception(message("executableCommon.missing_executable", "AWS CLI"))
                    is ExecutableInstance.InvalidExecutable -> throw Exception(awsCliExecutable.validationError)
                }

                val ptyProcess = constructExecCommand(awsCliExecutable)
                val process = CloudTerminalProcess(ptyProcess.outputStream, ptyProcess.inputStream)
                val runner = CloudTerminalRunner(project, container.containerDefinition.name(), process)

                runInEdt(ModalityState.any()) {
                    TerminalView.getInstance(project).createNewSession(runner, TerminalTabState().also { it.myTabName = container.containerDefinition.name() })
                }
                EcsTelemetry.runExecuteCommand(project, Result.Succeeded, EcsExecuteCommandType.Shell)
            }
        } catch (e: Exception) {
            EcsTelemetry.runExecuteCommand(project, Result.Failed, EcsExecuteCommandType.Shell)
        }
    }

    private fun constructExecCommand(executable: ExecutableInstance.Executable): PtyProcess {
        val task = tasks.selected() ?: throw IllegalStateException("No tasks selected")
        val commandLine = executable.getCommandLine().execCommand(
            environmentVariables,
            container.service.clusterArn(),
            task,
            ('"' + shell + '"'),
            container.containerDefinition.name()
        )
        return PtyProcess.exec(commandLine.getCommandLineList(null).toTypedArray(), commandLine.effectiveEnvironment, null)
    }
}
