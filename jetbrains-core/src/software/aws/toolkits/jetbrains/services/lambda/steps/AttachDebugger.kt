// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import com.intellij.execution.ExecutionException
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.ConsoleView
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.util.Key
import com.intellij.xdebugger.XDebugSessionListener
import com.intellij.xdebugger.XDebuggerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.resolveDebuggerSupport
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.steps.GetPorts.Companion.DEBUG_PORTS
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import java.util.concurrent.atomic.AtomicBoolean

class AttachDebugger(
    val environment: ExecutionEnvironment,
    val state: SamRunningState
) : Step(), CoroutineScope by ApplicationThreadPoolScope("AttachSamDebugger") {
    override val stepName = message("sam.debug.attach")
    override val hidden = false

    override fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean) {
        val session = runBlocking {
            try {
                withTimeout(SamDebugSupport.debuggerConnectTimeoutMs()) {
                    val debugPorts = context.getRequiredAttribute(DEBUG_PORTS)
                    val debugProcessStarter = state
                        .settings
                        .resolveDebuggerSupport()
                        .createDebugProcess(context, environment, state, state.settings.debugHost, debugPorts)
                    val session = runBlocking(getCoroutineUiContext()) {
                        val debugManager = XDebuggerManager.getInstance(environment.project)
                        // Requires EDT on some paths, so always requires to be run on EDT
                        debugManager.startSessionAndShowTab(environment.runProfile.name, environment.contentToReuse, debugProcessStarter)
                    }
                    val samProcessHandler = context.pollingGet(SamRunnerStep.SAM_PROCESS_HANDLER)
                    val samCompleted = AtomicBoolean(false)
                    samProcessHandler.addProcessListener(buildProcessAdapter { session.consoleView })
                    samProcessHandler.addProcessListener(object : ProcessAdapter() {
                        override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                            if (event.text.contains(SamExecutable.endDebuggingText)) {
                                samCompleted.set(true)
                            }
                        }
                    })
                    // Since there are two process's running (The SAM cli + the remote debugger), stopping
                    // the sam cli process ends the debugger, but not the other way around. To fix this, we
                    // could just always context.cancel(), which makes the SAM CLI process end, which works
                    // perfectly if the user presses stop. However, if the process ends normally, SAM cli will
                    // output the dreaded "Aborted!" after it prints the output. So, we need to keep track of
                    // if SAM cli is ending normally, and not exit when that happens. If the string ever changes,
                    // or there is an issue, the run configuration will always still end, it will just cause the
                    // "Aborted!" text to be printed
                    session.addSessionListener(object : XDebugSessionListener {
                        override fun sessionStopped() {
                            launch {
                                // So sadly this has a race condition, the debugger disconnects before
                                // the process actually ends, so if that branch goes faster, then we still
                                // call cancel. So, wait an arbitrary short amount of time (500ms) that should
                                // strike a good balance between speed and a reasonable amount of time for it to
                                // print and exit
                                for (i in 1..5) {
                                    if (samCompleted.get()) {
                                        return@launch
                                    } else {
                                        delay(100)
                                    }
                                }
                                context.cancel()
                            }
                        }
                    })
                    session
                }
            } catch (e: TimeoutCancellationException) {
                throw ExecutionException(message("lambda.debug.process.start.timeout"))
            } catch (e: Throwable) {
                LOG.warn(e) { "Failed to start debugger" }
                throw ExecutionException(e)
            }
        }
        // Make sure the session is always cleaned up
        launch {
            while (!context.isCompleted()) {
                delay(100)
            }
            session.stop()
        }
    }

    private companion object {
        val LOG = getLogger<AttachDebugger>()
        fun buildProcessAdapter(console: (() -> ConsoleView?)) = object : ProcessAdapter() {
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
}
