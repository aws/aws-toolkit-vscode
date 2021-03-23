// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.application.ExpirableExecutor
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.impl.coroutineDispatchingContext
import com.intellij.openapi.rd.defineNestedLifetime
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.xdebugger.XDebugProcessStarter
import com.jetbrains.rd.framework.IdKind
import com.jetbrains.rd.framework.Identities
import com.jetbrains.rd.framework.Protocol
import com.jetbrains.rd.framework.Serializers
import com.jetbrains.rd.framework.SocketWire
import com.jetbrains.rd.util.lifetime.isAlive
import com.jetbrains.rd.util.lifetime.onTermination
import com.jetbrains.rd.util.put
import com.jetbrains.rd.util.reactive.adviseUntil
import com.jetbrains.rdclient.protocol.RdDispatcher
import com.jetbrains.rider.debugger.RiderDebuggerWorkerModelManager
import com.jetbrains.rider.model.debuggerWorker.DotNetCoreAttachStartInfo
import com.jetbrains.rider.model.debuggerWorker.DotNetDebuggerSessionModel
import com.jetbrains.rider.model.debuggerWorkerConnectionHelperModel
import com.jetbrains.rider.projectView.solution
import com.jetbrains.rider.run.IDebuggerOutputListener
import com.jetbrains.rider.run.bindToSettings
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.jetbrains.concurrency.AsyncPromise
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.lambda.dotnet.FindDockerContainer.Companion.DOCKER_CONTAINER
import software.aws.toolkits.jetbrains.services.lambda.dotnet.FindPid.Companion.DOTNET_PID
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamDebugSupport
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.DotNetDebuggerUtils
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import java.net.InetAddress
import java.util.Timer
import kotlin.concurrent.schedule

object DotnetDebugUtils {
    private val LOG = getLogger<DotnetDebugUtils>()
    private const val DEBUGGER_MODE = "server"

    private const val REMOTE_DEBUGGER_DIR = "/tmp/lambci_debug_files"
    private const val REMOTE_NETCORE_CLI_PATH = "/var/lang/bin/dotnet"
    const val NUMBER_OF_DEBUG_PORTS = 2

    fun createDebugProcess(
        environment: ExecutionEnvironment,
        debugHost: String,
        debugPorts: List<Int>,
        context: Context
    ): XDebugProcessStarter {
        val frontendPort = debugPorts[0]
        val backendPort = debugPorts[1]
        val promise = AsyncPromise<XDebugProcessStarter>()
        val edtContext = getCoroutineUiContext(ModalityState.any(), environment)
        val bgContext = ExpirableExecutor.on(AppExecutorUtil.getAppExecutorService()).expireWith(environment).coroutineDispatchingContext()

        // Define a debugger lifetime to be able to dispose the debugger process and all nested component on termination
        // Using the environment as the disposable root seems to make 2nd usage of debug to fail since the lifetime is already terminated
        val debuggerLifetimeDefinition = environment.project.defineNestedLifetime()
        val debuggerLifetime = debuggerLifetimeDefinition.lifetime

        val scheduler = RdDispatcher(debuggerLifetime)

        val debugHostAddress = InetAddress.getByName(debugHost)

        val protocol = Protocol(
            name = environment.runProfile.name,
            serializers = Serializers(),
            identity = Identities(IdKind.Client),
            scheduler = scheduler,
            wire = SocketWire.Client(debuggerLifetime, scheduler, hostAddress = debugHostAddress, port = frontendPort, optId = "FrontendToDebugWorker"),
            lifetime = debuggerLifetime
        )

        val workerModel = runBlocking(edtContext) {
            RiderDebuggerWorkerModelManager.createDebuggerModel(debuggerLifetime, protocol)
        }

        ApplicationThreadPoolScope(environment.runProfile.name).launch(bgContext) {
            try {
                val dockerContainer = context.getRequiredAttribute(DOCKER_CONTAINER)
                val pid = context.getRequiredAttribute(DOTNET_PID)
                val riderDebuggerProcessHandler = startDebugWorker(dockerContainer, backendPort, frontendPort)

                withContext(edtContext) {
                    protocol.wire.connected.adviseUntil(debuggerLifetime) connected@{ isConnected ->
                        if (!isConnected) {
                            return@connected false
                        }

                        workerModel.initialized.adviseUntil(debuggerLifetime) initialized@{ isInitialized ->
                            if (!isInitialized) {
                                return@initialized false
                            }

                            // Fire backend to connect to debugger.
                            environment.project.solution.debuggerWorkerConnectionHelperModel.ports.put(
                                debuggerLifetime,
                                environment.executionId,
                                backendPort
                            )

                            val startInfo = DotNetCoreAttachStartInfo(
                                processId = pid,
                                needToBeInitializedImmediately = true
                            )

                            val sessionModel = DotNetDebuggerSessionModel(startInfo)
                            sessionModel.sessionProperties.bindToSettings(debuggerLifetime).apply {
                                enableHeuristicPathResolve.set(true)
                            }

                            workerModel.activeSession.set(sessionModel)

                            val console = TextConsoleBuilderFactory.getInstance().createBuilder(environment.project).console

                            promise.setResult(
                                DotNetDebuggerUtils.createAndStartSession(
                                    executionConsole = console,
                                    env = environment,
                                    sessionLifetime = debuggerLifetime,
                                    processHandler = riderDebuggerProcessHandler,
                                    protocol = protocol,
                                    sessionModel = sessionModel,
                                    outputEventsListener = object : IDebuggerOutputListener {}
                                )
                            )

                            return@initialized true
                        }

                        return@connected true
                    }
                }
            } catch (t: Throwable) {
                LOG.warn(t) { "Failed to start debugger" }
                debuggerLifetimeDefinition.terminate(true)
                withContext(edtContext) {
                    promise.setError(t)
                }
            }
        }

        val checkDebuggerTask = Timer("Debugger Worker launch timer", true).schedule(SamDebugSupport.debuggerConnectTimeoutMs()) {
            if (debuggerLifetimeDefinition.isAlive && !protocol.wire.connected.value) {
                runBlocking(edtContext) {
                    debuggerLifetimeDefinition.terminate()
                    promise.setError(message("lambda.debug.process.start.timeout"))
                }
            }
        }

        debuggerLifetime.onTermination {
            checkDebuggerTask.cancel()
        }

        return promise.get()!!
    }

    private fun startDebugWorker(dockerContainer: String, backendPort: Int, frontendPort: Int): OSProcessHandler {
        val runDebuggerCommand = GeneralCommandLine(
            "docker",
            "exec",
            "-i",
            dockerContainer,
            REMOTE_NETCORE_CLI_PATH,
            "$REMOTE_DEBUGGER_DIR/${DotNetDebuggerUtils.debuggerAssemblyFile.name}",
            "--mode=$DEBUGGER_MODE",
            "--frontend-port=$frontendPort",
            "--backend-port=$backendPort"
        )

        return ProcessHandlerFactory.getInstance().createProcessHandler(runDebuggerCommand)
    }
}
