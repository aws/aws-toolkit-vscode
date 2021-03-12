// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcessStarter
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.RuntimeDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState

class GoSamDebugSupport : RuntimeDebugSupport {
    override suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = createGoDebugProcess(environment, state, debugHost, debugPorts)

    override fun samArguments(debugPorts: List<Int>): List<String> = buildList {
        val debugger = copyDlv()
        add("--debugger-path")
        add(debugger)
        add("--debug-args")
        add("-delveAPI=2")
    }
}
