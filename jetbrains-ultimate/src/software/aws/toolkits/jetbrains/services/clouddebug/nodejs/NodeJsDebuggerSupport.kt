// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.nodejs

import com.intellij.execution.RunManager
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.execution.ui.RunnerLayoutUi
import com.intellij.javascript.debugger.console.WebConsoleView
import com.intellij.javascript.debugger.execution.RemoteUrlMappingBean
import com.jetbrains.debugger.wip.JSRemoteDebugConfiguration
import com.jetbrains.debugger.wip.JSRemoteDebugConfigurationType
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Context
import software.aws.toolkits.jetbrains.services.ecs.execution.ImmutableContainerOptions
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture

class NodeJsDebuggerSupport : DebuggerSupport() {
    override val platform = CloudDebuggingPlatform.NODE
    override val debuggerPath = null

    private val NODE_EXECUTABLES = setOf("node", "nodejs")
    private val NODE_DEBUG = "--inspect-brk"

    override fun attachDebugger(
        context: Context,
        containerName: String,
        containerOptions: ImmutableContainerOptions,
        environment: ExecutionEnvironment,
        ports: List<Int>,
        displayName: String
    ): CompletableFuture<RunContentDescriptor?> {
        val runSettings = RunManager.getInstance(environment.project).createConfiguration(displayName, JSRemoteDebugConfigurationType::class.java)
        (runSettings.configuration as JSRemoteDebugConfiguration).also {
            // hack in case the user modified their "Attach to Node.js/Chrome" configuration template
            it.beforeRunTasks = emptyList()
            it.port = ports.first()
            it.isV8Legacy = false
            it.mappings.addAll(
                convertArtifactMappingsToPathMappings(
                    containerOptions.artifactMappings, debuggerPath
                ).map { pair ->
                    RemoteUrlMappingBean(pair.first, pair.second)
                }
            )
        }

        return executeConfiguration(environment, runSettings)
    }

    override fun automaticallyAugmentable(input: List<String>): Boolean {
        // If it does not use node to start, we can't know what we need to add
        val exename = input.first().trim('"', '\'').substringAfterLast('/')
        if (!NODE_EXECUTABLES.contains(exename)) {
            return false
        }
        // Check that we are not using inspect already
        input.forEach {
            if (it == NODE_DEBUG) {
                throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.run_configuration.augment.debug_information_already_inside",
                        NODE_DEBUG
                    )
                )
            }
        }

        return true
    }

    override fun attachDebuggingArguments(input: List<String>, ports: List<Int>, debuggerPath: String): String =
        "${input.first()} $NODE_DEBUG=localhost:${ports.first()} ${input.drop(1).joinToString(" ")}"

    override fun getConsoleView(environment: ExecutionEnvironment, layout: RunnerLayoutUi) =
        super.getConsoleView(environment, layout).let {
            // place process output in its own tab if we have a REPL
            if (it is WebConsoleView) {
                createLogConsole(environment, layout)
            } else {
                it
            }
        }
}
