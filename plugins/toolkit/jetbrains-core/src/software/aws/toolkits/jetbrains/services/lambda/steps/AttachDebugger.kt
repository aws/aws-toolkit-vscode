// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import com.intellij.execution.ExecutionException
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.ConsoleView
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.application.invokeAndWaitIfNeeded
import com.intellij.openapi.util.Key
import com.intellij.xdebugger.XDebuggerManager
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.resolveDebuggerSupport
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.steps.GetPorts.Companion.DEBUG_PORTS
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.resources.message
import java.util.concurrent.atomic.AtomicBoolean

class AttachDebugger(val environment: ExecutionEnvironment, val state: SamRunningState) : Step() {
    override val stepName = message("sam.debug.attach")
    override val hidden = false

    override fun execute(context: Context, stepEmitter: StepEmitter, ignoreCancellation: Boolean) {
        try {
            val samProcessHandler = getSamProcess(context)
            val samCompleted = AtomicBoolean(false)

            samProcessHandler.addProcessListener(object : ProcessAdapter() {
                override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                    if (event.text.contains(SamExecutable.endDebuggingText)) {
                        samCompleted.set(true)
                    }
                }
            })

            val debugPorts = context.getRequiredAttribute(DEBUG_PORTS)
            val debugProcessStarter = prepAndCreateDebugProcessStart(context, debugPorts)
            val debugManager = XDebuggerManager.getInstance(environment.project)

            // Note: Do NOT use coroutines here due to it will deadlock Rider when starting the DotnetDebugProcess due to in storeUtil.kt
            // saveDocumentsAndProjectsAndApp has a runBlocking call that needs EDT and deadlocks coroutines
            invokeAndWaitIfNeeded {
                val session = debugManager.startSessionAndShowTab(environment.runProfile.name, environment.contentToReuse, debugProcessStarter)
                // Tie SAM output to the Debug tab's console so that it is viewable in both spots
                samProcessHandler.addProcessListener(buildProcessAdapter { session.consoleView })

                // Tie the debug session to the overall workflow, so if it gets cancelled (Stop button on SAM tab), we tell the debugger to stop too
                context.addListener(object : Context.Listener {
                    override fun onCancel() {
                        session.stop()
                    }

                    override fun onComplete() {
                        session.stop()
                    }
                })

                session.debugProcess.processHandler.addProcessListener(object : ProcessAdapter() {
                    override fun processWillTerminate(event: ProcessEvent, willBeDestroyed: Boolean) {
                        // If the user pressed Stop on the debug tab, cancel the entire flow
                        val requestedTermination = event.processHandler.getUserData(ProcessHandler.TERMINATION_REQUESTED) ?: false
                        if (requestedTermination) {
                            context.cancel()
                        }
                    }
                })
            }
        } catch (e: TimeoutCancellationException) {
            throw ExecutionException(message("lambda.debug.process.start.timeout"))
        } catch (e: Throwable) {
            throw ExecutionException(e)
        }
    }

    private fun prepAndCreateDebugProcessStart(context: Context, debugPorts: List<Int>) = runBlocking {
        withTimeout(SamDebugSupport.debuggerConnectTimeoutMs()) {
            state.settings
                .resolveDebuggerSupport()
                .createDebugProcess(context, environment, state, state.settings.debugHost, debugPorts)
        }
    }

    private fun getSamProcess(context: Context) = runBlocking {
        withTimeout(SamDebugSupport.debuggerConnectTimeoutMs()) {
            context.pollingGet(SamRunnerStep.SAM_PROCESS_HANDLER)
        }
    }

    private fun buildProcessAdapter(console: (() -> ConsoleView?)) = object : ProcessAdapter() {
        override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
            // Skip system messages
            if (outputType == ProcessOutputTypes.SYSTEM) {
                return
            }
            val viewType = if (outputType == ProcessOutputTypes.STDERR) {
                ConsoleViewContentType.ERROR_OUTPUT
            } else {
                ConsoleViewContentType.NORMAL_OUTPUT
            }
            console()?.print(event.text, viewType)
        }
    }
}
