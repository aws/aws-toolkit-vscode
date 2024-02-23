// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.Output
import com.intellij.execution.OutputListener
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.execution.runners.ProgramRunner
import com.intellij.openapi.application.runInEdt
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugSession
import com.intellij.xdebugger.XDebuggerManager
import com.intellij.xdebugger.XDebuggerManagerListener
import com.jetbrains.rdclient.util.idea.waitAndPump
import com.jetbrains.rider.projectView.solutionDirectory
import com.jetbrains.rider.test.scriptingApi.DebugTestExecutionContext
import com.jetbrains.rider.test.scriptingApi.debugProgramAfterAttach
import com.jetbrains.rider.test.scriptingApi.dumpFullCurrentData
import com.jetbrains.rider.test.scriptingApi.resumeSession
import com.jetbrains.rider.test.scriptingApi.waitForDotNetDebuggerInitializedOrCanceled
import com.jetbrains.rider.test.scriptingApi.waitForPause
import java.time.Duration
import java.util.concurrent.CompletableFuture
import kotlin.test.assertNotNull

private fun executeAndWaitOnAttach(runConfiguration: RunConfiguration): CompletableFuture<XDebugSession> {
    val project = runConfiguration.project
    val executorId = DefaultDebugExecutor.EXECUTOR_ID

    val sessionFuture = CompletableFuture<XDebugSession>()
    project.messageBus.connect().subscribe(
        XDebuggerManager.TOPIC,
        object : XDebuggerManagerListener {

            override fun processStarted(debugProcess: XDebugProcess) {
                println("Debugger attached: $debugProcess")
                debugProcess.processHandler.addProcessListener(object : OutputListener() {
                    override fun processTerminated(event: ProcessEvent) {
                        println("Debug worker terminated with exit code: ${this.output.exitCode}")
                        println("Debug worker stdout: ${this.output.stdout}")
                        println("Debug worker stderr: ${this.output.stderr}")
                    }
                })
                sessionFuture.complete(debugProcess.session)
            }
        }
    )

    val executor = ExecutorRegistry.getInstance().getExecutorById(executorId)
    assertNotNull(executor)
    val executionFuture = CompletableFuture<Output>()
    // In the real world create and execute runs on EDT
    runInEdt {
        try {
            @Suppress("UnsafeCallOnNullableType")
            val runner = ProgramRunner.getRunner(executorId, runConfiguration)!!
            val executionEnvironmentBuilder = ExecutionEnvironmentBuilder.create(executor, runConfiguration)
                .runner(runner)
            val executionEnvironment = executionEnvironmentBuilder.build()

            // TODO: exception isn't propagated out and test is forced to wait to timeout instead of exiting immediately
            executionEnvironment.runner.execute(executionEnvironment)
        } catch (e: Throwable) {
            executionFuture.completeExceptionally(e)
        }
    }
    return sessionFuture
}

fun executeRunConfigurationAndWaitRider(runConfiguration: RunConfiguration, executorId: String = DefaultRunExecutor.EXECUTOR_ID): Output {
    if (executorId == DefaultRunExecutor.EXECUTOR_ID) {
        val executeLambda = executeRunConfiguration(runConfiguration, executorId)
        // waitAndPump lets us run on EDT in the test itself without deadlocking since Rider runs tests on EDT
        // 4 is arbitrary, but Image-based functions can take > 3 min on first build/run, so 4 is a safe number
        waitAndPump(Duration.ofMinutes(4), { executeLambda.isDone })
        if (!executeLambda.isDone) {
            throw IllegalStateException("Took too long to execute Rider run configuration!")
        }
        return executeLambda.get()
    }

    val session = executeAndWaitOnAttach(runConfiguration)
    waitAndPump(Duration.ofMinutes(4), { session.isDone })

    val executionFuture = CompletableFuture<Output>()
    val waitAndTest: DebugTestExecutionContext.() -> Unit = {
        waitForDotNetDebuggerInitializedOrCanceled()
        waitForPause()
        this.session.debugProcess.processHandler.addProcessListener(object : OutputListener() {
            override fun processTerminated(event: ProcessEvent) {
                super.processTerminated(event)
                executionFuture.complete(this.output)
            }
        })
        // prints current debugger state for comparison against .gold file
        dumpFullCurrentData()
        resumeSession()
    }

    debugProgramAfterAttach(session.get(), runConfiguration.project.solutionDirectory.resolve("expected.gold"), waitAndTest, true)

    return executionFuture.get()
}
