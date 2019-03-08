// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.Output
import com.intellij.execution.OutputListener
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.process.ProcessEvent
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

fun executeLambda(
    runConfiguration: LocalLambdaRunConfiguration,
    executorId: String = DefaultRunExecutor.EXECUTOR_ID
): Output {
    val executor = ExecutorRegistry.getInstance().getExecutorById(executorId)
    val executionEnvironment = ExecutionEnvironmentBuilder.create(executor, runConfiguration).build()
    val executionFuture = CompletableFuture<Output>()
    runInEdt {
        executionEnvironment.runner.execute(executionEnvironment) {
            it.processHandler?.addProcessListener(object : OutputListener() {
                override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                    super.onTextAvailable(event, outputType)
                    println("SAM CLI: ${event.text}")
                }

                override fun processTerminated(event: ProcessEvent) {
                    super.processTerminated(event)
                    executionFuture.complete(this.output)
                }
            })
        }
    }

    return executionFuture.get(3, TimeUnit.MINUTES)
}

fun checkBreakPointHit(project: Project): Ref<Boolean> {
    val debuggerIsHit = Ref(false)

    project.messageBus.connect().subscribe(XDebuggerManager.TOPIC, object : XDebuggerManagerListener {
        override fun processStarted(debugProcess: XDebugProcess) {
            println("Debugger attached: $debugProcess")

            debugProcess.session.addSessionListener(object : XDebugSessionListener {
                override fun sessionPaused() {
                    runInEdt {
                        val suspendContext = debugProcess.session.suspendContext
                        println("Resuming: $suspendContext")
                        debuggerIsHit.set(true)
                        debugProcess.resume(suspendContext)
                    }
                }
            })
        }
    })

    return debuggerIsHit
}