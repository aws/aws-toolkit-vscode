// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext

class JavaSamDebugSupport : SamDebugSupport {
    private val edtContext = getCoroutineUiContext()

    override fun containerEnvVars(runtime: Runtime, packageType: PackageType, debugPorts: List<Int>): Map<String, String> {
        if (packageType != PackageType.IMAGE) {
            return mapOf()
        }
        return when (runtime) {
            Runtime.JAVA8, Runtime.JAVA8_AL2 -> mapOf(
                "_JAVA_OPTIONS" to "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=${debugPorts.first()} " +
                    "-XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC " +
                    "-XX:-TieredCompilation -Djava.net.preferIPv4Stack=true -Xshare:off"
            )
            else -> mapOf(
                "_JAVA_OPTIONS" to "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${debugPorts.first()} " +
                    "-XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC " +
                    "-XX:-TieredCompilation -Djava.net.preferIPv4Stack=true"
            )
        }
    }

    override suspend fun createDebugProcess(
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
