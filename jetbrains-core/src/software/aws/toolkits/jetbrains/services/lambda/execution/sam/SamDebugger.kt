// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.util.registry.Registry
import com.intellij.util.net.NetUtils
import com.intellij.xdebugger.XDebuggerManager
import com.jetbrains.rd.util.spinUntil
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class SamDebugger(settings: LocalLambdaRunSettings) : SamRunner(settings) {
    private val debugExtension = resolveDebuggerSupport(settings)
    private val debugPorts = NetUtils.findAvailableSocketPorts(debugExtension.numberOfDebugPorts()).toList()

    override fun patchCommandLine(commandLine: GeneralCommandLine) {
        commandLine.addParameters(debugExtension.samArguments(debugPorts))
        debugPorts.forEach {
            commandLine.withParameters("--debug-port").withParameters(it.toString())
        }
    }

    override fun run(environment: ExecutionEnvironment, state: SamRunningState): Promise<RunContentDescriptor> {
        val promise = AsyncPromise<RunContentDescriptor>()

        var isDebuggerAttachDone = false

        // In integration tests this will block for 1 minute per integration test that uses the debugger because we
        // run integration tests under edt. In real execution, there's some funky thread switching that leads this call
        // to not be on edt, but that is not emulated in tests. So, skip this entirely if we are in unit test mode.
        // Tests have their own timeout which will prevent it running forever without attaching
        if (!ApplicationManager.getApplication().isUnitTestMode) {
            ProgressManager.getInstance().run(
                object : Task.Backgroundable(environment.project, message("lambda.debug.waiting"), false) {
                    override fun run(indicator: ProgressIndicator) {
                        val debugAttachedResult = spinUntil(debuggerConnectTimeoutMs()) { isDebuggerAttachDone }
                        if (!debugAttachedResult) {
                            val message = message("lambda.debug.attach.fail")
                            LOG.error { message }
                            notifyError(message("lambda.debug.attach.error"), message, environment.project)
                        }
                    }
                }
            )
        }

        resolveDebuggerSupport(state.settings).createDebugProcessAsync(environment, state, state.settings.debugHost, debugPorts)
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

    private fun resolveDebuggerSupport(settings: LocalLambdaRunSettings) = when (settings) {
        is ImageTemplateRunSettings -> settings.imageDebugger
        is ZipSettings -> RuntimeDebugSupport.getInstance(settings.runtimeGroup)
        else -> throw IllegalStateException("Can't find debugger support for $settings")
    }

    companion object {
        private val LOG = getLogger<SamDebugger>()

        fun debuggerConnectTimeoutMs() = Registry.intValue("aws.debuggerAttach.timeout", 60000).toLong()
    }
}
