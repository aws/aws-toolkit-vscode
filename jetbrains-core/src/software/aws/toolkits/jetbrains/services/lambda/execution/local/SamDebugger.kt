// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.xdebugger.XDebuggerManager
import java.net.ServerSocket

internal class SamDebugger : SamRunner() {
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

    override fun run(environment: ExecutionEnvironment, state: SamRunningState): RunContentDescriptor {
        val debugSupport = SamDebugSupport.getInstanceOrThrow(state.settings.runtimeGroup)
        val debugProcess = debugSupport.createDebugProcess(environment, state, debugPort)
        val debugManager = XDebuggerManager.getInstance(environment.project)
        return debugProcess?.let {
            return debugManager.startSession(environment, debugProcess).runContentDescriptor
        } ?: throw IllegalStateException("Failed to create debug process")
    }
}