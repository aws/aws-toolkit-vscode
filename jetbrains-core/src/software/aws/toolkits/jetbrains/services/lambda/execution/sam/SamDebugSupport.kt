// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.ConsoleView
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.application.ExpirableExecutor
import com.intellij.openapi.application.impl.coroutineDispatchingContext
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.registry.Registry
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.xdebugger.XDebugProcessStarter
import kotlinx.coroutines.launch
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import java.util.Timer
import kotlin.concurrent.schedule

interface SamDebugSupport {
    fun numberOfDebugPorts(): Int = 1

    /**
     * SAM arguments added to the execution of `sam local invoke`. These include --debugger-path and --debug-args
     * for debugging, and anything else that is needed on a per-runtime basis
     * @param debugPorts The list of debugger ports. Some runtimes (dotnet) require more than one
     */
    fun samArguments(debugPorts: List<Int>): List<String> = emptyList()

    fun createDebugProcessAsync(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): Promise<XDebugProcessStarter> {
        val promise = AsyncPromise<XDebugProcessStarter>()
        val bgContext = ExpirableExecutor.on(AppExecutorUtil.getAppExecutorService()).expireWith(environment).coroutineDispatchingContext()

        val timerTask = Timer("Debugger Worker launch timer", true).schedule(debuggerConnectTimeoutMs()) {
            if (!promise.isDone) {
                runInEdt {
                    promise.setError(message("lambda.debug.process.start.timeout"))
                }
            }
        }

        ApplicationThreadPoolScope(environment.runProfile.name).launch(bgContext) {
            try {
                val debugProcess = createDebugProcess(environment, state, debugHost, debugPorts)

                runInEdt {
                    promise.setResult(debugProcess)
                }
            } catch (t: Throwable) {
                LOG.warn(t) { "Failed to start debugger" }
                runInEdt {
                    promise.setError(t)
                }
            } finally {
                timerTask.cancel()
            }
        }

        return promise
    }

    suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter

    companion object {
        private val LOG = getLogger<SamDebugSupport>()
        fun debuggerConnectTimeoutMs() = Registry.intValue("aws.debuggerAttach.timeout", 60000).toLong()

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
