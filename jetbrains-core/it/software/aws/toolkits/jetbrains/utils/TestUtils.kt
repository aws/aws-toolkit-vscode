// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.Output
import com.intellij.execution.OutputListener
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessOutputType
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.Ref
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.text.SemVer
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugSessionListener
import com.intellij.xdebugger.XDebuggerManager
import com.intellij.xdebugger.XDebuggerManagerListener
import org.assertj.core.api.Assertions.assertThat
import org.junit.Assume.assumeTrue
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutableIfPresent
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createTemplateRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon.Companion.minImageVersion
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import java.io.File
import java.nio.file.Paths
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
                it.processHandler?.addProcessListener(
                    object : OutputListener() {
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
                    }
                )
            }
        } catch (e: Exception) {
            executionFuture.completeExceptionally(e)
        }
    }

    // 5 is arbitrary, but Image-based functions can take > 3 min on first build/run, so 5 is a safer number
    return executionFuture.get(5, TimeUnit.MINUTES)
}

fun checkBreakPointHit(project: Project, callback: () -> Unit = {}): Ref<Boolean> {
    val debuggerIsHit = Ref(false)

    val messageBusConnection = project.messageBus.connect()
    messageBusConnection.subscribe(
        XDebuggerManager.TOPIC,
        object : XDebuggerManagerListener {
            override fun processStarted(debugProcess: XDebugProcess) {
                println("Debugger attached: $debugProcess")

                debugProcess.session.addSessionListener(
                    object : XDebugSessionListener {
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
                    }
                )
            }
        }
    )

    return debuggerIsHit
}

fun readProject(relativePath: String, sourceFileName: String, projectRule: CodeInsightTestFixtureRule): Pair<VirtualFile, VirtualFile> {
    val testDataPath = Paths.get(System.getProperty("testDataPath"), relativePath).toFile()
    val (source, template) = testDataPath.walk().fold<File, Pair<VirtualFile?, VirtualFile?>>(Pair(null, null)) { acc, file ->
        // skip directories which are part of the walk
        if (!file.isFile) {
            return@fold acc
        }
        val virtualFile = projectRule.fixture.addFileToModule(projectRule.module, file.relativeTo(testDataPath).path, file.readText()).virtualFile
        when (virtualFile.name) {
            "template.yaml" -> {
                acc.first to virtualFile
            }
            sourceFileName -> {
                virtualFile to acc.second
            }
            else -> {
                acc
            }
        }
    }

    assertNotNull(source)
    assertNotNull(template)

    // open the file so we can do stuff like set breakpoints on it
    runInEdtAndWait {
        projectRule.fixture.openFileInEditor(source)
    }

    return source to template
}

fun samImageRunDebugTest(
    projectRule: CodeInsightTestFixtureRule,
    relativePath: String,
    sourceFileName: String,
    runtime: LambdaRuntime,
    mockCredentialsId: String,
    input: String,
    expectedOutput: String = input.toUpperCase(),
    addBreakpoint: (() -> Unit)? = null
) {
    assumeImageSupport()
    val (_, template) = readProject(relativePath, sourceFileName, projectRule)

    addBreakpoint?.let { it() }

    val runConfiguration = createTemplateRunConfiguration(
        project = projectRule.project,
        runtime = runtime,
        templateFile = template.path,
        logicalId = "SomeFunction",
        input = "\"$input\"",
        credentialsProviderId = mockCredentialsId,
        isImage = true
    )

    assertNotNull(runConfiguration)

    val debuggerIsHit = checkBreakPointHit(projectRule.project)

    val executeLambda = if (addBreakpoint != null) {
        executeRunConfiguration(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)
    } else {
        executeRunConfiguration(runConfiguration)
    }

    assertThat(executeLambda.exitCode).isEqualTo(0)
    assertThat(executeLambda.stdout).contains(expectedOutput)

    if (addBreakpoint != null) {
        assertThat(debuggerIsHit.get()).isTrue()
    }
}

fun assumeImageSupport() {
    val samVersion = ExecutableManager.getInstance().getExecutableIfPresent<SamExecutable>().version?.let {
        SemVer.parseFromText(it)
    }
    assumeTrue(samVersion?.isGreaterOrEqualThan(minImageVersion) == true)
}
