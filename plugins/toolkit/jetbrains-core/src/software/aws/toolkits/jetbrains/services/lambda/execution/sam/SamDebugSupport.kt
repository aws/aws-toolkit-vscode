// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.util.registry.Registry
import com.intellij.xdebugger.XDebugProcessStarter
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step

interface SamDebugSupport {
    fun numberOfDebugPorts(): Int = 1

    /**
     * SAM arguments added to the execution of `sam local invoke`. These include --debugger-path and --debug-args
     * for debugging, and anything else that is needed on a per-runtime basis
     * @param debugPorts The list of debugger ports. Some runtimes (dotnet) require more than one
     */
    fun samArguments(debugPorts: List<Int>): List<String> = emptyList()

    fun additionalDebugProcessSteps(environment: ExecutionEnvironment, state: SamRunningState): List<Step> = listOf()

    suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter

    companion object {
        fun debuggerConnectTimeoutMs() = Registry.intValue("aws.debuggerAttach.timeout", 60000).toLong()
    }
}
