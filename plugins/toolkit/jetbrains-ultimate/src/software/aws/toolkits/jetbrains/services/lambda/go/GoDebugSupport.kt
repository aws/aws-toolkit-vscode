// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.goide.GoLanguage
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcessStarter
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.RuntimeDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.execution.steps.Context

class GoSamDebugSupport : RuntimeDebugSupport {
    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = GoDebugHelper.createGoDebugProcess(debugHost, debugPorts, context)

    override fun samArguments(debugPorts: List<Int>): List<String> = buildList {
        val debugger = GoDebugHelper.copyDlv()
        add("--debugger-path")
        add(debugger)
        add("--debug-args")
        add("-delveAPI=2")
    }
}

class GoImageDebugSupport : ImageDebugSupport {
    override val id = LambdaRuntime.GO1_X.toString()
    override fun displayName() = LambdaRuntime.GO1_X.toString().capitalize()

    override val languageId = GoLanguage.INSTANCE.id

    override fun samArguments(debugPorts: List<Int>): List<String> = buildList {
        val debugger = GoDebugHelper.copyDlv()
        addAll(super.samArguments(debugPorts))
        add("--debugger-path")
        add(debugger)
    }

    override fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = mapOf(
        "_AWS_LAMBDA_GO_DEBUGGING" to "1",
        "_AWS_LAMBDA_GO_DELVE_API_VERSION" to "2",
        "_AWS_LAMBDA_GO_DELVE_LISTEN_PORT" to debugPorts.first().toString(),
        "_AWS_LAMBDA_GO_DELVE_PATH" to "/tmp/lambci_debug_files/dlv",
    )

    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = GoDebugHelper.createGoDebugProcess(debugHost, debugPorts, context)
}
