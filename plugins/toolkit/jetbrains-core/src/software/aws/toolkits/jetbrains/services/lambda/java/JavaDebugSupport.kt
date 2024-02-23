// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.debugger.DebugEnvironment
import com.intellij.debugger.DebuggerManagerEx
import com.intellij.debugger.engine.JavaDebugProcess
import com.intellij.debugger.engine.RemoteDebugProcessHandler
import com.intellij.execution.DefaultExecutionResult
import com.intellij.execution.ExecutionResult
import com.intellij.execution.configurations.RemoteConnection
import com.intellij.execution.impl.ConsoleViewImpl
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.lang.java.JavaLanguage
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.psi.search.GlobalSearchScopes
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.intellij.xdebugger.impl.XDebugSessionImpl
import kotlinx.coroutines.withContext
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.RuntimeDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.execution.steps.Context

class JavaRuntimeDebugSupport : RuntimeDebugSupport {
    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = createDebugProcess(environment, debugHost, debugPorts)
}

abstract class JavaImageDebugSupport : ImageDebugSupport {
    override fun supportsPathMappings(): Boolean = true
    override val languageId = JavaLanguage.INSTANCE.id
    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = createDebugProcess(environment, debugHost, debugPorts)
}

open class Java8ImageDebugSupport : JavaImageDebugSupport() {
    override val id: String = LambdaRuntime.JAVA8.toString()
    override fun displayName() = LambdaRuntime.JAVA8.toString().capitalize()
    override fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = mapOf(
        "_JAVA_OPTIONS" to "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=${debugPorts.first()} " +
            "-XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC " +
            "-XX:-TieredCompilation -Djava.net.preferIPv4Stack=true -Xshare:off"
    )
}

class Java8Al2ImageDebugSupport : Java8ImageDebugSupport() {
    override val id: String = LambdaRuntime.JAVA8_AL2.toString()
    override fun displayName() = LambdaRuntime.JAVA8_AL2.toString().capitalize()
}

open class Java11ImageDebugSupport : JavaImageDebugSupport() {
    override val id: String = LambdaRuntime.JAVA11.toString()
    override fun displayName() = LambdaRuntime.JAVA11.toString().capitalize()
    override fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = mapOf(
        "_JAVA_OPTIONS" to "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${debugPorts.first()} " +
            "-XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC " +
            "-XX:-TieredCompilation -Djava.net.preferIPv4Stack=true"
    )
}

open class Java17ImageDebugSupport : JavaImageDebugSupport() {
    override val id: String = LambdaRuntime.JAVA17.toString()
    override fun displayName() = LambdaRuntime.JAVA17.toString().capitalize()
    override fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = mapOf(
        "_JAVA_OPTIONS" to "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${debugPorts.first()} " +
            "-XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC " +
            "-XX:-TieredCompilation -Djava.net.preferIPv4Stack=true"
    )
}

private val edtContext = getCoroutineUiContext()

private suspend fun createDebugProcess(
    environment: ExecutionEnvironment,
    debugHost: String,
    debugPorts: List<Int>
): XDebugProcessStarter {
    val connection = RemoteConnection(true, debugHost, debugPorts.first().toString(), false)
    val debugEnvironment = RemotePortDebugEnvironment(environment, connection)
    val debuggerManager = DebuggerManagerEx.getInstanceEx(environment.project)

    val debuggerSession = withContext(edtContext) {
        debuggerManager.attachVirtualMachine(debugEnvironment)
    } ?: throw IllegalStateException("Attaching to the JVM failed! $debugHost:${debugPorts.first()}")

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

/**
 * We are required to make our own so we do not end up in a loop. DefaultDebugEnvironment will execute the run config again
 * which make a tragic recursive loop starting the run config an infinite number of times
 */
private class RemotePortDebugEnvironment(private val environment: ExecutionEnvironment, private val connection: RemoteConnection) : DebugEnvironment {
    override fun createExecutionResult(): ExecutionResult {
        val consoleView = ConsoleViewImpl(environment.project, false)
        val process = RemoteDebugProcessHandler(environment.project)
        consoleView.attachToProcess(process)
        return DefaultExecutionResult(consoleView, process)
    }

    override fun getSearchScope(): GlobalSearchScope = GlobalSearchScopes.executionScope(environment.project, environment.runProfile)
    override fun isRemote(): Boolean = true
    override fun getRemoteConnection(): RemoteConnection = connection
    override fun getPollTimeout(): Long = DebugEnvironment.LOCAL_START_TIMEOUT.toLong()
    override fun getSessionName(): String = environment.runProfile.name
}
