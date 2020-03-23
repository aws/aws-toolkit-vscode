// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.ecs.execution.ArtifactMapping
import software.aws.toolkits.resources.message

/**
 * Startup command for ECS CloudDebug.
 * A command to launch a debugger process on a remote Docker instance.
 */
open class CloudDebugStartupCommand(val platform: CloudDebuggingPlatform) {

    open val isStartCommandAutoFillSupported: Boolean = false

    /**
     * Update a startup command after selecting an artifact to use to run debugger.
     *
     * On a regular basis we should use one of Artifact mapping to provide a valid path to a debugger and assembly to run inside a remote container.
     * This method provide a way to map one of specified Artifact mapping value to generate startup command automatically.
     *
     * @param project - [com.intellij.openapi.project.Project] instance
     * @param originalCommand - Original command from Startup Command text field from ECS CloudDebug run configuration
     * @param artifact - Selected Artifact mapping to use for updating startup command.
     * @param onCommandGet - Callback to run when command is ready.
     */
    open fun updateStartupCommand(project: Project, originalCommand: String, artifact: ArtifactMapping, onCommandGet: (String) -> Unit) { }

    /**
     * Hint text is shown inside empty Startup Command text field.
     */
    open fun getStartupCommandTextFieldHintText(): String = ""

    /**
     * Validate startup command against run configuration.
     *
     * @throws [RuntimeConfigurationError] on errors in startup command for a particular platform.
     */
    @Throws(RuntimeConfigurationError::class)
    open fun validateStartupCommand(command: String, containerName: String) {
        if (command.isBlank()) {
            throw RuntimeConfigurationError(message("cloud_debug.run_configuration.missing.start_command", containerName))
        }
    }
}
