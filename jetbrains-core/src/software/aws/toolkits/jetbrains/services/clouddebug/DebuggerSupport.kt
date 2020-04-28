// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.ProgramRunnerUtil
import com.intellij.execution.RunnerAndConfigurationSettings
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.execution.ui.ConsoleView
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.execution.ui.RunnerLayoutUi
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.util.execution.ParametersListUtil
import com.intellij.util.io.isDirectory
import com.intellij.util.io.isFile
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Context
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.ResourceTransferStep
import software.aws.toolkits.jetbrains.services.ecs.execution.ImmutableArtifactMapping
import software.aws.toolkits.jetbrains.services.ecs.execution.ImmutableContainerOptions
import software.aws.toolkits.resources.message
import java.io.File
import java.nio.file.Paths
import java.util.EnumMap
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

abstract class DebuggerSupport {
    abstract val platform: CloudDebuggingPlatform
    abstract val debuggerPath: DebuggerPath?

    open val numberOfDebugPorts: Int = 1

    /**
     * Attach a debugger to the given environment.
     *
     * Returns a [CompletionStage] that:
     * - completes with the [RunContentDescriptor] associated with that debugger
     * - completes with null if an exception occurs during attachment
     * - completes exceptionally if an error occurs before attachment
     */
    abstract fun attachDebugger(
        context: Context,
        containerName: String,
        containerOptions: ImmutableContainerOptions,
        environment: ExecutionEnvironment,
        ports: List<Int>,
        displayName: String
    ): CompletableFuture<RunContentDescriptor?>

    fun automaticallyAugmentable(input: String): Boolean {
        val parameters = ParametersListUtil.parse(input, true, false)
        // If there is only one argument, there is nothing to augment
        if (parameters.size < 2) {
            return false
        }
        if (parameters.first().trim().first() == '\'') {
            throw RuntimeConfigurationError(message("cloud_debug.run_configuration.augment.single_quote"))
        }
        return automaticallyAugmentable(parameters)
    }

    open fun createDebuggerUploadStep(context: Context, containerName: String): ResourceTransferStep? {
        val debugPath = debuggerPath ?: return null
        return ResourceTransferStep(debugPath.getDebuggerPath(), debugPath.getRemoteDebuggerPath(), containerName)
    }

    protected abstract fun automaticallyAugmentable(input: List<String>): Boolean

    /**
     * Alter the start string to add debugger arguments
     */
    protected abstract fun attachDebuggingArguments(input: List<String>, ports: List<Int>, debuggerPath: String): String

    open fun augmentStatement(input: String, ports: List<Int>, debuggerPath: String): String {
        if (ports.isEmpty()) {
            throw IllegalStateException(message("cloud_debug.step.augment_statement.missing_debug_port"))
        }

        return "env ${CloudDebugConstants.REMOTE_DEBUG_PORT_ENV}=${ports.first()} ${attachDebuggingArguments(
            input = ParametersListUtil.parse(input, true, false),
            ports = ports,
            debuggerPath = debuggerPath
        )}"
    }

    /**
     * Assuming the debugger implementation is per-language and not per-IDE, return the console that should be used for process output
     */
    open fun getConsoleView(environment: ExecutionEnvironment, layout: RunnerLayoutUi): ConsoleView =
        layout.findContent("ConsoleContent")?.component as? ConsoleView ?: createLogConsole(environment, layout)

    open fun startupCommand(): CloudDebugStartupCommand = CloudDebugStartupCommand(platform)

    interface DebuggerPath {
        /**
         * Get the path to the debugger if we need to copy it. For every runtime we need it for, the IDE ships with
         * an appropriate debugger so this function just returns a string to it.
         */
        fun getDebuggerPath(): String

        /**
         * Get the path to the debugger on the remote machine. This corresponds to the actual entry point of the debugger (e.x. pydevd.py for python)
         */
        fun getDebuggerEntryPoint(): String

        /**
         * Get the path for where a remote debugger will be put
         */
        fun getRemoteDebuggerPath(): String
    }

    companion object {
        const val LOCALHOST_NAME = "localhost"
        val EP_NAME = ExtensionPointName<DebuggerSupport>("aws.toolkit.clouddebug.debuggerSupport")

        @JvmStatic
        fun debuggers(): EnumMap<CloudDebuggingPlatform, DebuggerSupport> {
            val items = EP_NAME.extensions.map {
                it.platform to it
            }
            return if (items.isEmpty()) {
                EnumMap(CloudDebuggingPlatform::class.java)
            } else {
                EnumMap(items.toMap())
            }
        }

        @JvmStatic
        fun debugger(platform: CloudDebuggingPlatform) = debuggers()[platform]
            ?: throw IllegalStateException(message("cloud_debug.step.attach_debugger.unknown_platform", platform))

        fun executeConfiguration(environment: ExecutionEnvironment, runSettings: RunnerAndConfigurationSettings): CompletableFuture<RunContentDescriptor?> {
            val env = ExecutionEnvironmentBuilder.create(DefaultDebugExecutor.getDebugExecutorInstance(), runSettings)
                .contentToReuse(null)
                .dataContext(environment.dataContext)
                .activeTarget()
                .build()

            val future = CompletableFuture<RunContentDescriptor?>()
            ApplicationManager.getApplication().executeOnPooledThread {
                val executorRegistry = ExecutorRegistry.getInstance()
                while (executorRegistry.isStarting(environment)) {
                    // only one session for a given <project, executor, runner> triple can be started at a time
                    Thread.sleep(100)
                }

                runInEdt {
                    ProgramRunnerUtil.executeConfigurationAsync(env, true, true) { future.complete(it) }
                }
            }

            return future
        }

        fun createLogConsole(environment: ExecutionEnvironment, layout: RunnerLayoutUi): ConsoleView {
            val consoleBuilder = TextConsoleBuilderFactory.getInstance().createBuilder(environment.project)
            consoleBuilder.setViewer(true)
            val console = consoleBuilder.console
            console.allowHeavyFilters()
            val content = layout.createContent("CloudDebugLogsTab", console.component, message("cloud_debug.execution.logs.title"), null, null)
            layout.addContent(content)

            return console
        }
    }

    fun convertArtifactMappingsToPathMappings(
        artifactMappings: List<ImmutableArtifactMapping>,
        debuggerPath: DebuggerPath?
    ): List<Pair<String, String>> {
        val mappings = mutableSetOf<Pair<String, String>>()
        artifactMappings.forEach { a ->
            assert(!a.localPath.isBlank() && !a.remotePath.isBlank())
            mappings.add(createPathMapping(a.localPath, a.remotePath))
        }
        if (debuggerPath != null) {
            mappings.add(Pair(debuggerPath.getDebuggerPath(), debuggerPath.getRemoteDebuggerPath()))
        }
        return mappings.toList()
    }

    private fun createPathMapping(localPath: String, remotePath: String): Pair<String, String> {
        val localPathObj = Paths.get(localPath)

        val modifiedRemotePath = when {
            // folder itself is being copied, map it to the resulting remote path
            localPathObj.isDirectory() && !localPath.endsWith(File.separatorChar) -> "$remotePath/${localPathObj.fileName}"
            // remote path is a file; remote path should be a directory
            localPathObj.isFile() && !remotePath.endsWith('/') -> remotePath.substringBeforeLast('/')
            // is a file or contents of files are being copied to the remote path
            else -> remotePath
        }
        return Pair(localPath, modifiedRemotePath)
    }
}
