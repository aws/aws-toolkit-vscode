// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.util.registry.Registry
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import java.net.InetSocketAddress
import java.nio.file.Files

class GoSamDebugSupport : SamDebugSupport {
    override suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter {
        val executionResult = state.execute(environment.executor, environment.runner)

        return object : XDebugProcessStarter() {
            override fun start(session: XDebugSession): XDebugProcess {
                val process = createDelveDebugProcess(session, executionResult)

                val processHandler = executionResult.processHandler
                val socketAddress = InetSocketAddress(debugHost, debugPorts.first())

                if (processHandler == null || processHandler.isStartNotified) {
                    // this branch should never actually be hit because it gets here too fast
                    process.connect(socketAddress)
                } else {
                    processHandler.addProcessListener(
                        object : ProcessAdapter() {
                            override fun startNotified(event: ProcessEvent) {
                                ApplicationThreadPoolScope("GoSamDebugAttacher").launch {
                                    // If we don't wait, then then debugger will try to attach to
                                    // the container before it starts Devle. So, we have to add a sleep.
                                    // Delve takes quite a while to start in the sam cli images hence long sleep
                                    // See https://youtrack.jetbrains.com/issue/GO-10279
                                    // TODO revisit this to see if higher IDE versions help FIX_WHEN_MIN_IS_211 (?)
                                    // 2000 is what JB uses in this scenario, so use it as our default
                                    delay(Registry.intValue("aws.sam.goDebuggerDelay", 2000).toLong())
                                    process.connect(socketAddress)
                                }
                            }
                        }
                    )
                }
                return process
            }
        }
    }

    override fun samArguments(runtime: Runtime, packageType: PackageType, debugPorts: List<Int>): List<String> = buildList {
        val debugger = copyDlv()
        add("--debugger-path")
        add(debugger)
        add("--debug-args")
        if (packageType == PackageType.IMAGE) {
            add(
                "/var/runtime/aws-lambda-go delveAPI -delveAPI=2 -delvePort=${debugPorts.first()} -delvePath=/tmp/lambci_debug_files/dlv"
            )
        } else {
            add("-delveAPI=2")
        }
    }

    private fun copyDlv(): String {
        val dlvFolder = getDelve()
        val directory = Files.createTempDirectory("goDebugger")
        Files.copy(dlvFolder.resolve("dlv").toPath(), directory.resolve("dlv"))
        // Delve that comes packaged with the IDE does not have the executable flag set
        directory.resolve("dlv").toFile().setExecutable(true)
        return directory.toAbsolutePath().toString()
    }

    private companion object {
        val LOG = getLogger<GoSamDebugSupport>()
    }
}
