// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.io.createDirectories
import java.nio.file.Path
import java.nio.file.Paths

/**
 * Service for managing external tools such as CLIs.
 */
interface ToolManager {

    /**
     * Returns a reference to the requested tool.
     *
     * The returned Tool will first be checked if the user has set a path for it explicitly. If they have not, we will attempt to detect it for them if
     * supported.
     * Note: The tool may not have been checked for [Validity] yet. Caller must make the check before using the tool.
     */
    fun <V : Version> getTool(type: ToolType<V>): Tool<ToolType<V>>?

    fun <V : Version> getOrInstallTool(type: ManagedToolType<V>, project: Project? = null): Tool<ToolType<V>>

    /**
     * Returns a reference to the requested tool located at the specified path.
     *
     * Note: The tool may not have been checked for [Validity] yet. Caller must make the check before using the tool.
     */
    fun <V : Version> getToolForPath(type: ToolType<V>, toolExecutablePath: Path): Tool<ToolType<V>>

    /**
     * Attempts to detect the requested Tool on the local file system.
     *
     * @return Either the path to the tool if found, or null if the tool can't be found or not auto-detectable
     */
    fun <V : Version> detectTool(type: ToolType<V>): Path?

    /**
     * Checks the [Validity] of the specified tool instance. An optional stricter version can be specified to override the minimum version.
     *
     * If called on a UI thread, a modal dialog is shown while the validation is in progress to avoid UI lock-ups
     */
    fun <T : Version> validateCompatability(
        tool: Tool<ToolType<T>>?,
        stricterMinVersion: T? = null,
        project: Project? = null
    ): Validity

    companion object {
        fun getInstance(): ToolManager = service()

        internal val MANAGED_TOOL_INSTALL_ROOT by lazy {
            Paths.get(PathManager.getSystemPath(), "aws-static-resources").resolve("tools").createDirectories()
        }
    }
}

/**
 * Checks the [Validity] of the specified tool at the specified path. An optional stricter version can be specified to override the minimum version.
 *
 * If called on a UI thread, a modal dialog is shown while the validation is in progress to avoid UI lock-ups
 */
fun <T : Version> ToolManager.validateCompatability(
    path: Path,
    type: ToolType<T>,
    stricterMinVersion: T? = null,
    project: Project? = null
): Validity = validateCompatability(getToolForPath(type, path), stricterMinVersion, project)

fun <V : Version> ToolType<V>.getTool(): Tool<ToolType<V>>? = ToolManager.getInstance().getTool(this)

fun <V : Version> ManagedToolType<V>.getOrInstallTool(project: Project? = null): Tool<ToolType<V>> = ToolManager.getInstance().getOrInstallTool(this, project)
