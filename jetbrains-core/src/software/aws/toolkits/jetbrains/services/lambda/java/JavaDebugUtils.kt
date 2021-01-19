// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.debugger.DebuggerManagerEx
import com.intellij.debugger.DefaultDebugEnvironment
import com.intellij.debugger.engine.JavaDebugProcess
import com.intellij.execution.DefaultExecutionResult
import com.intellij.execution.configurations.RemoteConnection
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.intellij.xdebugger.impl.XDebugSessionImpl
import kotlinx.coroutines.withContext
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext

object JavaDebugUtils {
    private val edtContext = getCoroutineUiContext()

    suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter? {
        val connection = RemoteConnection(true, debugHost, debugPorts.first().toString(), false)
        val debugEnvironment = DefaultDebugEnvironment(environment, state, connection, true)
        val debuggerManager = DebuggerManagerEx.getInstanceEx(environment.project)

        val debuggerSession = withContext(edtContext) {
            debuggerManager.attachVirtualMachine(debugEnvironment)
        } ?: return null

        return object : XDebugProcessStarter() {
            override fun start(session: XDebugSession): XDebugProcess {
                if (session is XDebugSessionImpl) {
                    val debugProcess = debuggerSession.process
                    val executionResult = debugProcess.executionResult
                    session.addExtraActions(*executionResult.actions)
                    if (executionResult is DefaultExecutionResult) {
                        session.addRestartActions(*executionResult.restartActions)
                    }
                }

                return JavaDebugProcess.create(session, debuggerSession)
            }
        }
    }
}
