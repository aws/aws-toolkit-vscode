// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.application.ExpirableExecutor
import com.intellij.openapi.application.impl.coroutineDispatchingContext
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.util.net.NetUtils
import com.intellij.xdebugger.XDebugProcessStarter
import kotlinx.coroutines.launch
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import java.util.Timer
import kotlin.concurrent.schedule

interface SamDebugSupport {

    val debuggerAttachTimeoutMs: Long
        get() = 60000L

    /**
     * SAM arguments added to the execution of `sam local invoke`. These include --debugger-path and --debug-args
     * for debugging, and anything else that is needed on a per-runtime basis
     * @param runtime The Lambda runtime that is used for execution. This matters for some runtimes like Java that
     * do not have debugger arguments that work on all versions
     * @param packageType The Lambda package type (ZIP or Image), which determines which versions of args to use
     * @param debugPorts The list of debugger ports. Some runtimes (dotnet) require more than one
     */
    fun samArguments(runtime: Runtime, packageType: PackageType, debugPorts: List<Int>): List<String> = listOf()

    /**
     * Environment variables added to the execution of the container. These are used for debugging support for OCI
     * runtimes. The SAM CLI sets these for Zip based functions, but not Image based functions. An easy starting point
     * for the arguments is the list SAM cli maintains for Zip functions:
     * https://github.com/aws/aws-sam-cli/blob/develop/samcli/local/docker/lambda_debug_settings.py
     * @param runtime The Lambda runtime that is used for execution. This matters for some runtimes like Java that
     * @param packageType The Lambda package type (ZIP or Image), which determines which versions of args to use
     * do not have debugger arguments that work on all versions
     * @param debugPorts The list of debugger ports. Some runtimes (dotnet) require more than one
     */
    fun containerEnvVars(runtime: Runtime, packageType: PackageType, debugPorts: List<Int>): Map<String, String> = mapOf()

    fun createDebugProcessAsync(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): Promise<XDebugProcessStarter?> {
        val promise = AsyncPromise<XDebugProcessStarter?>()
        val bgContext = ExpirableExecutor.on(AppExecutorUtil.getAppExecutorService()).expireWith(environment).coroutineDispatchingContext()

        val timerTask = Timer("Debugger Worker launch timer", true).schedule(debuggerAttachTimeoutMs) {
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

    fun isSupported(runtime: Runtime): Boolean = true // Default behavior is all runtimes in the runtime group are supported

    fun getDebugPorts(): List<Int> = listOf(NetUtils.tryToFindAvailableSocketPort())

    companion object : RuntimeGroupExtensionPointObject<SamDebugSupport>(ExtensionPointName("aws.toolkit.lambda.sam.debugSupport")) {
        private val LOG = getLogger<SamDebugSupport>()
    }
}
