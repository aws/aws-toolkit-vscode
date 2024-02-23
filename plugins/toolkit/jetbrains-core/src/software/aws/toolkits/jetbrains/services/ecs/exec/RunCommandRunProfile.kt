// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.execution.Executor
import com.intellij.execution.configurations.CommandLineState
import com.intellij.execution.configurations.RunProfile
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.process.ColoredProcessHandler
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.process.ProcessTerminatedListener
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.ProgramRunner
import com.intellij.execution.ui.RunContentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.services.ecs.ContainerDetails
import javax.swing.Icon

class RunCommandRunProfile(
    private val project: Project,
    private val connection: ConnectionSettings,
    private val container: ContainerDetails,
    private val task: String,
    private val command: String
) : RunProfile {

    override fun getState(executor: Executor, environment: ExecutionEnvironment): RunProfileState = RunCommandRunProfileState(environment)

    override fun getName(): String = container.containerDefinition.name()

    override fun getIcon(): Icon? = null

    inner class RunCommandRunProfileState(environment: ExecutionEnvironment) : CommandLineState(environment) {
        init {
            consoleBuilder = TextConsoleBuilderFactory.getInstance().createBuilder(project)
        }

        override fun startProcess(): ProcessHandler {
            val processHandler = ColoredProcessHandler(EcsExecUtils.createCommand(project, connection, container, task, command))
            ProcessTerminatedListener.attach(processHandler)
            return processHandler
        }

        override fun execute(executor: Executor, runner: ProgramRunner<*>) = super.execute(executor, runner).apply {
            processHandler?.addProcessListener(object : ProcessAdapter() {
                override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                    if (outputType === ProcessOutputTypes.STDOUT ||
                        outputType === ProcessOutputTypes.STDERR
                    ) {
                        RunContentManager.getInstance(project).toFrontRunContent(executor, processHandler)
                    }
                }
            })
        }
    }
}
