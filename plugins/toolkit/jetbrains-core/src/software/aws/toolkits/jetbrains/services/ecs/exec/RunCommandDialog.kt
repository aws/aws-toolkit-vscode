// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.toNullableProperty
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.map
import software.aws.toolkits.jetbrains.services.ecs.ContainerDetails
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcsExecuteCommandType
import software.aws.toolkits.telemetry.EcsTelemetry
import software.aws.toolkits.telemetry.Result
import javax.swing.JComponent
import javax.swing.plaf.basic.BasicComboBoxEditor

class RunCommandDialog(private val project: Project, private val container: ContainerDetails, private val connectionSettings: ConnectionSettings) :
    DialogWrapper(project) {
    private val coroutineScope = projectCoroutineScope(project)
    private val commandList = CollectionComboBoxModel(commandsEnteredPreviously.toMutableList())

    var command = ""
    var task: String? = null
    val taskList = ResourceSelector.builder().resource(
        EcsResources.listTasks(container.service.clusterArn(), container.service.serviceArn()).map { it }
    ).awsConnection(project).build()

    init {
        super.init()
        title = message("ecs.execute_command_run")
        setOKButtonText(message("general.execute_button"))
    }

    override fun createCenterPanel(): JComponent = panel {
        row(message("ecs.execute_command_task.label")) {
            cell(taskList)
                .bindItem(::task.toNullableProperty())
                .errorOnApply(message("ecs.execute_command_task_comboBox_empty")) {
                    it.selected().isNullOrEmpty()
                }.columns(30)
        }
        row(message("ecs.execute_command.label")) {
            comboBox(commandList).bindItem({ command }, {
                if (it != null) {
                    command = it
                }
            })
                .errorOnApply(message("ecs.execute_command_no_command")) { it.item.isNullOrEmpty() }
                .applyToComponent {
                    isEditable = true
                    selectedIndex = -1
                    editor = object : BasicComboBoxEditor.UIResource() {
                        override fun createEditorComponent() =
                            JBTextField().also { it.emptyText.text = message("ecs.execute_command_run_command_default_text") }
                    }
                }.align(AlignX.FILL)
        }
    }

    override fun doOKAction() {
        super.doOKAction()
        commandsEnteredPreviously.add(command)
        val task = task ?: throw IllegalStateException("Task not Selected")
        coroutineScope.launch {
            val taskRoleFound: Boolean = EcsExecUtils.checkRequiredPermissions(project, container.service.clusterArn(), task)
            if (taskRoleFound) {
                runCommand(task)
            } else {
                withContext(getCoroutineUiContext()) {
                    TaskRoleNotFoundWarningDialog(project).show()
                }
            }
        }
    }

    override fun doCancelAction() {
        super.doCancelAction()
        EcsTelemetry.runExecuteCommand(project = project, result = Result.Cancelled, ecsExecuteCommandType = EcsExecuteCommandType.Command)
    }

    private suspend fun runCommand(task: String) {
        try {
            val environment = ExecutionEnvironmentBuilder.create(
                project,
                DefaultRunExecutor.getRunExecutorInstance(),
                RunCommandRunProfile(project, connectionSettings, container, task, command)
            ).build()

            withContext(getCoroutineUiContext()) {
                environment.runner.execute(environment)
            }

            EcsTelemetry.runExecuteCommand(project = project, result = Result.Succeeded, ecsExecuteCommandType = EcsExecuteCommandType.Command)
        } catch (e: Exception) {
            e.notifyError(message("ecs.execute_command_failed"))
            LOG.warn(e) { "Run command failed" }
            EcsTelemetry.runExecuteCommand(project = project, result = Result.Failed, ecsExecuteCommandType = EcsExecuteCommandType.Command)
        }
    }

    companion object {
        private val commandsEnteredPreviously = mutableSetOf<String>()
        private val LOG = getLogger<RunCommandDialog>()
    }
}
