// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.xdebugger.XDebuggerManager
import com.jetbrains.rd.util.spinUntil
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.net.ServerSocket

internal class SamDebugger : SamRunner() {

    companion object {
        private val logger = getLogger<SamDebugger>()
    }

    private val debugPort = findDebugPort()

    private fun findDebugPort(): Int {
        try {
            ServerSocket(0).use {
                it.reuseAddress = true
                return it.localPort
            }
        } catch (e: Exception) {
            throw IllegalStateException("Failed to find free port", e)
        }
    }

    override fun patchCommandLine(state: SamRunningState, commandLine: GeneralCommandLine) {
        SamDebugSupport.getInstanceOrThrow(state.settings.runtimeGroup)
            .patchCommandLine(debugPort, state, commandLine)
    }

    override fun run(environment: ExecutionEnvironment, state: SamRunningState): Promise<RunContentDescriptor> {
        val debugSupport = SamDebugSupport.getInstanceOrThrow(state.settings.runtimeGroup)
        val promise = AsyncPromise<RunContentDescriptor>()

        try {
            val exitValue = Runtime.getRuntime().exec("docker ps").waitFor()
            if (exitValue != 0) {
                promise.setError(message("lambda.debug.docker.not_connected"))
                return promise
            }
        } catch (t: Throwable) {
            promise.setError(t)
            return promise
        }

        var isDebuggerAttachDone = false

        ProgressManager.getInstance().run(object : Task.Backgroundable(environment.project, message("lambda.debug.waiting"), false) {
            override fun run(indicator: ProgressIndicator) {
                val debugAttachedResult = spinUntil(debugSupport.debuggerAttachTimeoutMs) { isDebuggerAttachDone }
                if (!debugAttachedResult) {
                    val message = message("lambda.debug.attach.fail")
                    logger.error { message }
                    notifyError(message("lambda.debug.attach.error"), message, environment.project)
                }
            }
        })

        debugSupport.createDebugProcessAsync(environment, state, debugPort)
            .onSuccess { debugProcessStarter ->
                val debugManager = XDebuggerManager.getInstance(environment.project)
                val runContentDescriptor = debugProcessStarter?.let {
                    return@let debugManager.startSession(environment, debugProcessStarter).runContentDescriptor
                }
                if (runContentDescriptor == null) {
                    promise.setError(IllegalStateException("Failed to create debug process"))
                } else {
                    promise.setResult(runContentDescriptor)
                }
            }
            .onError {
                promise.setError(it)
            }
            .onProcessed {
                isDebuggerAttachDone = true
            }

        return promise
    }
}