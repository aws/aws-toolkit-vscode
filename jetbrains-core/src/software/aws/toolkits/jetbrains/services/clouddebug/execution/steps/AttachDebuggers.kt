// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution.steps

import com.intellij.execution.OutputListener
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.ConsoleView
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.util.Key
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Context
import software.aws.toolkits.jetbrains.services.clouddebug.execution.MessageEmitter
import software.aws.toolkits.jetbrains.services.clouddebug.execution.ParallelStep
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Step
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsServiceCloudDebuggingRunSettings
import software.aws.toolkits.jetbrains.services.ecs.execution.ImmutableContainerOptions
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudDebugPlatform
import software.aws.toolkits.telemetry.ClouddebugTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ExecutionException

/**
 * Implements the "Debug $SERVICE" menu item in the ECS tree of AWS Explorer.
 */
class SetUpDebuggers(private val settings: EcsServiceCloudDebuggingRunSettings, private val environment: ExecutionEnvironment) : ParallelStep() {
    override val stepName = message("cloud_debug.step.attach_debugger")
    override val hidden = false

    override fun buildChildSteps(context: Context): List<Step> = settings.containerOptions.map { (containerName, options) ->
        AttachDebugger(containerName, options, environment)
    }
}

/**
 * Implements the "Debug $SERVICE" menu item in the ECS tree of AWS Explorer.
 */
class AttachDebugger(
    private val containerName: String,
    private val containerOptions: ImmutableContainerOptions,
    private val environment: ExecutionEnvironment
) : Step() {
    override val stepName = message("cloud_debug.step.attach_debugger.resource", containerName)

    override fun execute(
        context: Context,
        messageEmitter: MessageEmitter,
        ignoreCancellation: Boolean
    ) {
        val startTime = Instant.now()
        var result = Result.Succeeded
        try {
            val debuggerAttacher = DebuggerSupport.debuggers()[containerOptions.platform]
                ?: throw IllegalStateException(
                    message(
                        "cloud_debug.step.attach_debugger.unknown_platform", containerOptions.platform
                    )
                )

            val debugPorts = SetUpPortForwarding.getDebugPortsForContainer(context, containerName)

            val attachDebuggerFuture = debuggerAttacher.attachDebugger(context, containerName, containerOptions, environment, debugPorts, stepName)
            val descriptor = attachDebuggerFuture.get()
            var stdoutLogsHandler: ProcessHandler? = null
            var stderrLogsHandler: ProcessHandler? = null

            runInEdt {
                descriptor?.runnerLayoutUi?.let {
                    val console = debuggerAttacher.getConsoleView(environment, it)
                    stdoutLogsHandler = tailContainerLogs(context, console, false)
                    stderrLogsHandler = tailContainerLogs(context, console, true)
                }
            }

            // This should block so that the run config does not complete until debuggers die, or we can kill all from the stop command
            descriptor?.processHandler?.let {
                waitForDebuggerToDisconnect(it, context)
                // debugger has disconnected so we should stop tailing logs, safe access is needed due to initiliazation requirements
                ApplicationManager.getApplication().executeOnPooledThread {
                    Thread.sleep(5000)
                    stdoutLogsHandler?.destroyProcess()
                    stderrLogsHandler?.destroyProcess()
                }
            } ?: throw IllegalStateException(message("cloud_debug.step.attach_debugger.failed"))
        } catch (e: ExecutionException) {
            result = Result.Failed
            throw e.cause ?: e
        } finally {
            ClouddebugTelemetry.attachDebugger(
                project = context.project,
                result = result,
                workflowtoken = context.workflowToken,
                clouddebugplatform = CloudDebugPlatform.from(containerOptions.platform.name),
                value = Duration.between(startTime, Instant.now()).toMillis().toDouble(),
                createTime = startTime
            )
        }
    }

    private fun tailContainerLogs(context: Context, console: ConsoleView, stderr: Boolean): ProcessHandler {
        val commandLine = context.getRequiredAttribute(CloudDebugCliValidate.EXECUTABLE_ATTRIBUTE).getCommandLine()
            .withParameters("--target")
            .withParameters(ResourceInstrumenter.getTargetForContainer(context, containerName))
            /* TODO remove this when the cli conforms to the contract */
            .withParameters("--selector")
            .withParameters(containerName)
            .withParameters("logs")
            .withParameters("--follow")

        if (stderr) {
            commandLine.withParameters("--filter", "stderr")
        } else {
            commandLine.withParameters("--filter", "stdout")
        }

        val handler = ProcessHandlerFactory.getInstance().createProcessHandler(commandLine)

        val viewType = if (stderr) {
            ConsoleViewContentType.ERROR_OUTPUT
        } else {
            ConsoleViewContentType.NORMAL_OUTPUT
        }

        handler.addProcessListener(object : OutputListener() {
            override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                // Skip system messages
                if (outputType == ProcessOutputTypes.SYSTEM) {
                    return
                }
                console.print(event.text, viewType)
            }
        })

        handler.startNotify()

        return handler
    }

    private fun waitForDebuggerToDisconnect(processHandler: ProcessHandler, context: Context) {
        while (!processHandler.waitFor(WAIT_INTERVAL_MILLIS)) {
            if (context.isCancelled()) {
                if (!processHandler.isProcessTerminating && !processHandler.isProcessTerminated) {
                    processHandler.destroyProcess()
                }
            }
        }
    }

    private companion object {
        private const val WAIT_INTERVAL_MILLIS = 100L
    }
}
