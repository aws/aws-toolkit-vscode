// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.application.ExpirableExecutor
import com.intellij.openapi.application.impl.coroutineDispatchingContext
import com.intellij.openapi.application.runInEdt
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
    ): Promise<XDebugProcessStarter?> {
        val promise = AsyncPromise<XDebugProcessStarter?>()
        val bgContext = ExpirableExecutor.on(AppExecutorUtil.getAppExecutorService()).expireWith(environment).coroutineDispatchingContext()

        val timerTask = Timer("Debugger Worker launch timer", true).schedule(SamDebugger.debuggerConnectTimeoutMs()) {
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
    ): XDebugProcessStarter?

    private companion object {
        val LOG = getLogger<SamDebugSupport>()
    }
}
