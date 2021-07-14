// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.execution.ExecutionResult
import com.intellij.execution.Executor
import com.intellij.execution.configurations.CommandLineState
import com.intellij.execution.configurations.GeneralCommandLine
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
import javax.swing.Icon

class RunCommandRunProfile(
    private val credentials: Map<String, String>,
    private val parameters: String?,
    private val containerName: String,
    private val path: String
) : RunProfile {
    override fun getState(executor: Executor, environment: ExecutionEnvironment): RunProfileState? {
        val cmdLine = getCommandLine()
        val project = environment.project
        if (cmdLine == null) {
            return null
        }
        val commandLineState = CmdLineState(environment, cmdLine, project)
        val builder = TextConsoleBuilderFactory.getInstance().createBuilder(project)
        commandLineState.consoleBuilder = builder
        return commandLineState
    }

    override fun getName(): String = containerName

    override fun getIcon(): Icon? = null

    fun getCommandLine(): GeneralCommandLine? {
        val commandLine = GeneralCommandLine()
        commandLine.parametersList.addParametersString(parameters)
        commandLine.exePath = path
        commandLine.withEnvironment(credentials)
        return commandLine
    }
}

class CmdLineState(
    environment: ExecutionEnvironment,
    private val cmdLine: GeneralCommandLine,
    private val project: Project,
) : CommandLineState(environment) {
    override fun startProcess(): ProcessHandler {
        val processHandler = ColoredProcessHandler(cmdLine)
        ProcessTerminatedListener.attach(processHandler)
        return processHandler
    }

    override fun execute(executor: Executor, runner: ProgramRunner<*>): ExecutionResult {
        val result = super.execute(executor, runner)
        val processHandler = result.processHandler
        processHandler?.addProcessListener(object : ProcessAdapter() {
            override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                if (outputType === ProcessOutputTypes.STDOUT ||
                    outputType === ProcessOutputTypes.STDERR
                ) {
                    RunContentManager.getInstance(project).toFrontRunContent(executor, processHandler)
                }
            }
        })
        return result
    }
}
