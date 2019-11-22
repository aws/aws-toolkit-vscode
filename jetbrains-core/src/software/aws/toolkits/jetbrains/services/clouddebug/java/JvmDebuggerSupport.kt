// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.java

import com.intellij.execution.RunManager
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.remote.RemoteConfiguration
import com.intellij.execution.remote.RemoteConfigurationType
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.RunContentDescriptor
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Context
import software.aws.toolkits.jetbrains.services.ecs.execution.ImmutableContainerOptions
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture

class JvmDebuggerSupport : DebuggerSupport() {
    override val platform = CloudDebuggingPlatform.JVM
    override val debuggerPath: DebuggerPath? = null

    override fun automaticallyAugmentable(input: List<String>): Boolean {
        if (input.first().trim('"', '\'').substringAfterLast('/') != JAVA_EXECUTABLE) {
            return false
        }
        // Finally, check that we are not using java debugging arguments
        input.forEach {
            if (it.contains(JAVA_DEBUG)) {
                throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.run_configuration.augment.debug_information_already_inside",
                        JAVA_DEBUG
                    )
                )
            }
            if (it.contains(JAVA_5_DEBUG)) {
                throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.run_configuration.augment.debug_information_already_inside",
                        JAVA_5_DEBUG
                    )
                )
            }
        }
        return true
    }

    override fun attachDebuggingArguments(input: List<String>, ports: List<Int>, debuggerPath: String): String =
        "${input.firstOrNull()} -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=${ports.first()} ${input.drop(1).joinToString(" ")}"

    override fun attachDebugger(
        context: Context,
        containerName: String,
        containerOptions: ImmutableContainerOptions,
        environment: ExecutionEnvironment,
        ports: List<Int>,
        displayName: String
    ): CompletableFuture<RunContentDescriptor?> {
        val runSettings = RunManager.getInstance(environment.project).createConfiguration(displayName, RemoteConfigurationType::class.java)
        runSettings.isActivateToolWindowBeforeRun = false
        // hack in case the user modified their Java Remote configuration template
        runSettings.configuration.beforeRunTasks = emptyList()

        (runSettings.configuration as RemoteConfiguration).apply {
            HOST = LOCALHOST_NAME
            PORT = ports.first().toString()
            USE_SOCKET_TRANSPORT = true
            SERVER_MODE = false
        }

        return executeConfiguration(environment, runSettings)
    }

    private companion object {
        // java start command
        private const val JAVA_EXECUTABLE = "java"
        /*
         * This is the debugging syntax pre java 5. it is still valid but requires 2 flags (with -Xdebug as well), so
         * we go with the new syntax.
         */
        private const val JAVA_DEBUG = "-Xrunjdwp:transport="
        /*
         * This is valid for Java 5 and higher.
         */
        private const val JAVA_5_DEBUG = "-agentlib:jdwp=transport"
    }
}
