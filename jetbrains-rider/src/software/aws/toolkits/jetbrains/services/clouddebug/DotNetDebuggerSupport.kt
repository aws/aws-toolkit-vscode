// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.rd.defineNestedLifetime
import com.intellij.openapi.util.io.FileUtil
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebuggerManager
import com.jetbrains.rd.framework.IdKind
import com.jetbrains.rd.framework.Identities
import com.jetbrains.rd.framework.Protocol
import com.jetbrains.rd.framework.Serializers
import com.jetbrains.rd.framework.SocketWire
import com.jetbrains.rd.framework.impl.RpcTimeouts
import com.jetbrains.rd.util.lifetime.isAlive
import com.jetbrains.rd.util.lifetime.onTermination
import com.jetbrains.rd.util.put
import com.jetbrains.rd.util.reactive.adviseUntil
import com.jetbrains.rdclient.protocol.RdDispatcher
import com.jetbrains.rider.RiderEnvironment
import com.jetbrains.rider.debugger.DebuggerHelperHost
import com.jetbrains.rider.debugger.RiderDebuggerWorkerModelManager
import com.jetbrains.rider.model.debuggerWorker.DotNetCoreExeStartInfo
import com.jetbrains.rider.model.debuggerWorker.DotNetCoreInfo
import com.jetbrains.rider.model.debuggerWorker.DotNetDebuggerSessionModel
import com.jetbrains.rider.model.debuggerWorkerConnectionHelperModel
import com.jetbrains.rider.projectView.solution
import com.jetbrains.rider.run.IDebuggerOutputListener
import com.jetbrains.rider.run.bindToSettings
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.trace
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.ResourceTransferStep
import software.aws.toolkits.jetbrains.services.ecs.execution.ImmutableContainerOptions
import software.aws.toolkits.jetbrains.utils.DotNetDebuggerUtils
import software.aws.toolkits.jetbrains.utils.DotNetRuntimeUtils
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.resources.message
import java.io.File
import java.io.FileNotFoundException
import java.io.OutputStream
import java.util.Timer
import java.util.concurrent.CompletableFuture
import kotlin.concurrent.schedule

class DotNetDebuggerSupport : DebuggerSupport() {
    companion object {
        private val logger = getLogger<DotNetDebuggerSupport>()

        private const val DOTNET_EXECUTABLE = "dotnet"
        private const val START_COMMAND_ASSEMBLY_PLACEHOLDER = "$DOTNET_EXECUTABLE <path_to_assembly>"
        private const val DEBUGGER_MODE = "server"
    }

    private var exeRemotePath: String = ""

    override val numberOfDebugPorts: Int
        get() = 2

    override val platform: CloudDebuggingPlatform
        get() = CloudDebuggingPlatform.DOTNET

    private var localDebuggerPath: String = ""

    override fun startupCommand(): CloudDebugStartupCommand = DotNetStartupCommand()

    override val debuggerPath = object : DebuggerPath {
        override fun getDebuggerPath(): String = localDebuggerPath

        override fun getDebuggerEntryPoint(): String =
            "${getRemoteDebuggerPath()}/${DotNetDebuggerUtils.cloudDebuggerTempDirName}/${DotNetDebuggerUtils.debuggerAssemblyFile.name}"

        // TODO fix when cloud-debug fixes rsync to run mkdir -p
        override fun getRemoteDebuggerPath(): String =
            // "/aws/cloud-debug/debugger/$platform"
            "/aws/$platform"
    }

    override fun attachDebugger(
        context: Context,
        containerName: String,
        containerOptions: ImmutableContainerOptions,
        environment: ExecutionEnvironment,
        ports: List<Int>,
        displayName: String
    ): CompletableFuture<RunContentDescriptor?> {
        val manager = XDebuggerManager.getInstance(environment.project)
        val future = CompletableFuture<RunContentDescriptor?>()

        if (exeRemotePath.isEmpty()) {
            future.completeExceptionally(RuntimeException("DotNet executable to debug is not specified"))
            return future
        }

        if (ports.size < 2) {
            future.completeExceptionally(RuntimeException("DotNet requires two ports to be specified"))
            return future
        }

        val frontendPort = ports[0]
        val backendPort = ports[1]

        runInEdt {
            try {
                createDebugProcessAsync(environment, frontendPort, backendPort, exeRemotePath).then {
                    it?.let {
                        future.complete(
                            manager.startSessionAndShowTab(
                                displayName,
                                null,
                                it
                            ).runContentDescriptor
                        )
                    } ?: run {
                        future.complete(null)
                    }
                }
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }

        return future
    }

    override fun createDebuggerUploadStep(context: Context, containerName: String): ResourceTransferStep? {
        val debuggerAssemblyNames =
            DebuggerHelperHost.getInstance(context.project).model.getDebuggerAssemblies.sync(Unit, RpcTimeouts.longRunning)

        // Helper assembly to detect dbgshim on 192 Rider
        val tempDirectory = FileUtil.getTempDirectory()
        val debuggerLocalTemp = File(tempDirectory, DotNetDebuggerUtils.cloudDebuggerTempDirName)
        if (debuggerLocalTemp.exists()) {
            FileUtil.delete(debuggerLocalTemp)
        }
        debuggerLocalTemp.mkdirs()
        localDebuggerPath = debuggerLocalTemp.canonicalPath

        prepareDebuggerArtifacts(debuggerLocalTemp, debuggerAssemblyNames.toTypedArray())

        val remoteDebuggerPath = debuggerPath.getRemoteDebuggerPath()
        return ResourceTransferStep(
            localPath = localDebuggerPath,
            remotePath = remoteDebuggerPath,
            containerName = containerName
        )
    }

    override fun automaticallyAugmentable(input: List<String>): Boolean {
        if (input.first().trim() != DOTNET_EXECUTABLE)
            throw RuntimeConfigurationError(message("cloud_debug.run_configuration.dotnet.start_command.miss_runtime", DOTNET_EXECUTABLE))

        val restCommands = input.drop(1)
        val path = restCommands.firstOrNull()?.trim()
            ?: throw RuntimeConfigurationError(
                message("cloud_debug.run_configuration.dotnet.start_command.miss_assembly_path", START_COMMAND_ASSEMBLY_PLACEHOLDER)
            )

        if (!path.contains('/'))
            throw RuntimeConfigurationError(message("cloud_debug.run_configuration.dotnet.start_command.assembly_path_not_valid", path))

        // Start command should follow the pattern 'dotnet <remote_path_to_assembly>'. Take a remote assembly path.
        exeRemotePath = path
        return true
    }

    override fun attachDebuggingArguments(input: List<String>, ports: List<Int>, debuggerPath: String): String {
        val debuggerRemoteDirPath = "${this.debuggerPath.getRemoteDebuggerPath()}/${DotNetDebuggerUtils.cloudDebuggerTempDirName}"

        val remoteDebuggerLogPath = "$debuggerRemoteDirPath/Logs"

        if (ports.size < 2) {
            val message = message("cloud_debug.step.dotnet.two_ports_required")
            logger.debug { message }
            throw IllegalStateException(message)
        }

        val frontendPort = ports[0]
        val backendPort = ports[1]

        val debugArgs = StringBuilder()
            .append("RESHARPER_HOST_LOG_DIR=$remoteDebuggerLogPath ")
            .append("dotnet ")
            .append("$debuggerPath ")
            .append("--mode=$DEBUGGER_MODE ")
            .append("--frontend-port=$frontendPort ")
            .append("--backend-port=$backendPort")

        logger.info { "Attaching default Rider Debugger arguments" }
        return debugArgs.toString()
    }

    private fun createDebugProcessAsync(
        environment: ExecutionEnvironment,
        frontendPort: Int,
        backendPort: Int,
        exeRemotePath: String
    ): Promise<XDebugProcessStarter?> {
        val promise = AsyncPromise<XDebugProcessStarter?>()

        // Define a debugger lifetime to be able to dispose the debugger process and all nested component on termination
        val debuggerLifetimeDefinition = environment.defineNestedLifetime()
        val debuggerLifetime = debuggerLifetimeDefinition.lifetime

        val scheduler = RdDispatcher(debuggerLifetime)
        val startInfo = createNetCoreStartInfo(
            exePath = exeRemotePath
        )

        val protocol = Protocol(
            name = "",
            serializers = Serializers(),
            identity = Identities(IdKind.Client),
            scheduler = scheduler,
            wire = SocketWire.Client(
                lifetime = debuggerLifetime,
                scheduler = scheduler,
                port = frontendPort,
                optId = "FrontendToDebugWorker"
            ),
            lifetime = debuggerLifetime
        )

        protocol.wire.connected.adviseUntil(debuggerLifetime) connected@{ isConnected ->
            if (!isConnected) {
                return@connected false
            }

            try {
                val workerModel = RiderDebuggerWorkerModelManager.createDebuggerModel(debuggerLifetime, protocol)

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

                    val sessionModel = DotNetDebuggerSessionModel(startInfo)
                    sessionModel.sessionProperties.bindToSettings(debuggerLifetime).apply {
                        enableHeuristicPathResolve.set(true)
                        remoteDebug.set(true)
                    }

                    workerModel.activeSession.set(sessionModel)
                    val console = TextConsoleBuilderFactory.getInstance().createBuilder(environment.project).console
                    val processHandler = object : ProcessHandler() {
                        override fun detachProcessImpl() {
                            destroyProcessImpl()
                        }

                        override fun detachIsDefault(): Boolean = false
                        override fun getProcessInput(): OutputStream? = null

                        override fun destroyProcessImpl() {
                            notifyProcessTerminated(0)
                        }

                        fun notifyProcessDestroyed(exitCode: Int) {
                            notifyProcessTerminated(exitCode)
                        }
                    }

                    processHandler.addProcessListener(
                        object : ProcessAdapter() {
                            override fun processTerminated(event: ProcessEvent) {
                                logger.trace { "Process exited. Terminating debugger lifetime" }
                                runInEdt {
                                    debuggerLifetimeDefinition.terminate()
                                }
                            }
                        }
                    )

                    workerModel.targetExited.advise(debuggerLifetime) {
                        logger.trace { "Target exited" }
                        // We should try to kill deployment there because it's already stopped,
                        // just notify debugger session about termination via its process handler.
                        processHandler.notifyProcessDestroyed(it.exitCode ?: 0)
                    }

                    promise.setResult(
                        DotNetDebuggerUtils.createAndStartSession(
                            executionConsole = console,
                            env = environment,
                            sessionLifetime = debuggerLifetime,
                            processHandler = processHandler,
                            protocol = protocol,
                            sessionModel = sessionModel,
                            outputEventsListener = object : IDebuggerOutputListener {}
                        )
                    )

                    return@initialized true
                }
            } catch (t: Throwable) {
                debuggerLifetimeDefinition.terminate()
                promise.setError(t)
            }
            return@connected true
        }

        val checkDebuggerTask = Timer("Debugger Worker launch timer", true).schedule(60_000L) {
            if (debuggerLifetimeDefinition.isAlive && !protocol.wire.connected.value) {
                debuggerLifetimeDefinition.terminate()
                promise.setError(message("lambda.debug.process.start.timeout"))
            }
        }

        debuggerLifetime.onTermination {
            checkDebuggerTask.cancel()
        }

        return promise
    }

    private fun createNetCoreStartInfo(exePath: String): DotNetCoreExeStartInfo =
        DotNetCoreExeStartInfo(
            dotNetCoreInfo = DotNetCoreInfo(null, null),
            exePath = exePath,
            workingDirectory = "",
            arguments = "",
            environmentVariables = emptyList(),
            runtimeArguments = null,
            executeAsIs = false,
            useExternalConsole = false,
            needToBeInitializedImmediately = true
        )

    private fun prepareDebuggerArtifacts(targetPath: File, assemblyNames: Array<String>) {
        val assemblyFileErrors = mutableListOf<String>()

        for (assemblyName in assemblyNames) {
            val assemblyFile =
                try {
                    // Look through DLL file
                    val dllFileName = "$assemblyName.dll"
                    RiderEnvironment.getBundledFile(dllFileName)
                } catch (e: FileNotFoundException) {
                    // Look through EXE file
                    val exeFileName = "$assemblyName.exe"
                    try {
                        RiderEnvironment.getBundledFile(exeFileName)
                    } catch (e: FileNotFoundException) {
                        null
                    }
                }

            if (assemblyFile == null) {
                assemblyFileErrors.add(assemblyName)
                logger.trace { "Cannot find assembly with name: '$assemblyName'" }
                continue
            }

            FileUtil.copy(assemblyFile, File(targetPath, assemblyFile.name))
            logger.trace { "Copy '${assemblyFile.canonicalPath}'" }

            // Check runtimeconfig.json
            val runtimeFileName = "$assemblyName.runtimeconfig.json"
            try {
                val runtimeFile = RiderEnvironment.getBundledFile(runtimeFileName)
                // overwrite runtimeconfig of Rider assemblies with own ones which target netcoreapp2.1 instead of 3.0
                FileUtil.writeToFile(File(targetPath, runtimeFile.name), DotNetRuntimeUtils.RUNTIME_CONFIG_JSON_21, false)
                logger.trace { "Write '${runtimeFile.canonicalPath}'" }
            } catch (e: FileNotFoundException) {
                logger.trace { "Cannot find '$runtimeFileName'" }
            }

            // Check deps.json files
            val depsFileName = "$assemblyName.deps.json"
            try {
                val depsFile = RiderEnvironment.getBundledFile(depsFileName)
                FileUtil.copy(depsFile, File(targetPath, depsFile.name))
                logger.trace { "Copy '${depsFile.canonicalPath}'" }
            } catch (e: FileNotFoundException) {
                logger.trace { "Cannot find '$depsFileName'" }
            }
        }

        if (assemblyFileErrors.isNotEmpty())
            throw IllegalStateException("Unable to find necessary assembly with names: '${assemblyFileErrors.joinToString(", ")}'")

        val linuxSubdirectoryName = "linux-x64"

        val linuxMonoSubdirectory = File(targetPath, linuxSubdirectoryName)
        if (linuxMonoSubdirectory.isDirectory) {
            try {
                // remove existing linux Mono distribution since we run debugger on container .net core
                linuxMonoSubdirectory.deleteRecursively()
            } catch (e: Throwable) {
                logger.trace(e) { "Error while trying to delete unused linux Mono directory ${linuxMonoSubdirectory.absolutePath}" }
            }
        }
    }
}
