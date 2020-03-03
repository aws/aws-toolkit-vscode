// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.Output
import com.intellij.execution.OutputListener
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessOutputType
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.Ref
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugSessionListener
import com.intellij.xdebugger.XDebuggerManager
import com.intellij.xdebugger.XDebuggerManagerListener
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import kotlin.test.assertNotNull

fun executeRunConfiguration(
    runConfiguration: RunConfiguration,
    executorId: String = DefaultRunExecutor.EXECUTOR_ID
): Output {
    val executor = ExecutorRegistry.getInstance().getExecutorById(executorId)
    assertNotNull(executor)
    val executionFuture = CompletableFuture<Output>()
    runInEdt {
        val executionEnvironment = ExecutionEnvironmentBuilder.create(executor, runConfiguration).build()
        try {
            executionEnvironment.runner.execute(executionEnvironment) {
                it.processHandler?.addProcessListener(object : OutputListener() {
                    override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                        // Ansi codes throw off the default logic, so remap it to check the base type
                        val processOutputType = outputType as? ProcessOutputType
                        val baseType = processOutputType?.baseOutputType ?: outputType

                        super.onTextAvailable(event, baseType)

                        println("[${if (baseType == ProcessOutputTypes.STDOUT) "stdout" else "stderr"}]: ${event.text}")
                    }

                    override fun processTerminated(event: ProcessEvent) {
                        super.processTerminated(event)
                        executionFuture.complete(this.output)
                    }
                })
            }
        } catch (e: Exception) {
            executionFuture.completeExceptionally(e)
        }
    }

    return executionFuture.get(3, TimeUnit.MINUTES)
}

fun checkBreakPointHit(project: Project, callback: () -> Unit = {}): Ref<Boolean> {
    val debuggerIsHit = Ref(false)

    val messageBusConnection = project.messageBus.connect()
    messageBusConnection.subscribe(XDebuggerManager.TOPIC, object : XDebuggerManagerListener {
        override fun processStarted(debugProcess: XDebugProcess) {
            println("Debugger attached: $debugProcess")

            debugProcess.session.addSessionListener(object : XDebugSessionListener {
                override fun sessionPaused() {
                    runInEdt {
                        val suspendContext = debugProcess.session.suspendContext
                        println("Resuming: $suspendContext")
                        callback()
                        debuggerIsHit.set(true)
                        debugProcess.resume(suspendContext)
                    }
                }

                override fun sessionStopped() {
                    debuggerIsHit.setIfNull(false) // Used to prevent having to wait for max timeout
                }
            })
        }
    })

    return debuggerIsHit
}
