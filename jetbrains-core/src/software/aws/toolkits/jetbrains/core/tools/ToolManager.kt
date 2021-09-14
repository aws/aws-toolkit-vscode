// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.ExceptionUtil
import software.aws.toolkits.jetbrains.utils.assertIsNonDispatchThread
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.nio.file.Paths

/**
 * Service for managing external tools such as CLIs.
 */
class ToolManager {
    private val versionCache = ToolVersionCache()

    /**
     * Returns a reference to the requested tool.
     *
     * The returned Tool will first be checked if the user has set a path for it explicitly. If they have not, we will attempt to detect it for them.
     * Note: The tool may not have been checked for [Validity] yet. Caller must make the check before using the tool.
     */
    fun <T : ToolType<V>, V : Version> getTool(type: T): Tool<T>? = getToolExecutablePath(type)?.let { getTool(type, it) }

    /**
     * Returns a reference to the requested tool located at the specified path.
     *
     * Note: The tool may not have been checked for [Validity] yet. Caller must make the check before using the tool.
     */
    fun <T : ToolType<V>, V : Version> getTool(type: T, toolExecutablePath: Path): Tool<T> = Tool(type, toolExecutablePath)

    private fun <T : ToolType<*>> getToolExecutablePath(type: T): Path? {
        // Check if user gave a custom path
        ToolSettings.getInstance().getExecutablePath(type)?.let {
            return Paths.get(it)
        }

        return detectTool(type)
    }

    /**
     * Attempts to detect the requested Tool on the local file system.
     *
     * @return Either the path to the tool if found, or null if the tool can't be found or not auto-detectable
     */
    fun <T : ToolType<*>> detectTool(type: T): Path? = if (type is AutoDetectableTool<*>) {
        type.resolve()
    } else {
        null
    }

    /**
     * Checks the [Validity] of the specified tool at the specified path. An optional stricter version can be specified to override the minimum version.
     *
     * If called on a UI thread, a modal dialog is shown while the validation is in progress to avoid UI lock-ups
     */
    fun <T : Version> validateCompatability(
        project: Project? = null,
        path: Path,
        type: ToolType<T>,
        stricterMinVersion: T? = null
    ): Validity = validateCompatability(project, getTool(type, path), stricterMinVersion)

    /**
     * Checks the [Validity] of the specified tool instance. An optional stricter version can be specified to override the minimum version.
     *
     * If called on a UI thread, a modal dialog is shown while the validation is in progress to avoid UI lock-ups
     */
    fun <T : Version> validateCompatability(
        project: Project? = null,
        tool: Tool<ToolType<T>>?,
        stricterMinVersion: T? = null
    ): Validity {
        if (tool == null) {
            return Validity.NotInstalled()
        }

        return runUnderProgressIfNeeded(project, message("executableCommon.validating", tool.type.displayName), false) {
            determineCompatability(tool, stricterMinVersion)
        }
    }

    private fun <T : Version> determineCompatability(tool: Tool<ToolType<T>>, stricterMinVersion: T?): Validity {
        assertIsNonDispatchThread()

        val version = when (val cacheResult = versionCache.getValue(tool)) {
            is ToolVersionCache.Result.Failure -> return Validity.NotInstalled(ExceptionUtil.getMessage(cacheResult.reason))
            is ToolVersionCache.Result.Success -> cacheResult.version
        }

        val baseVersionCompatability = tool.type.supportedVersions()?.let {
            version.isValid(it)
        } ?: Validity.Valid(version)

        if (baseVersionCompatability !is Validity.Valid) {
            return baseVersionCompatability
        }

        stricterMinVersion?.let {
            if (stricterMinVersion > version) {
                return Validity.VersionTooOld(stricterMinVersion)
            }
        }

        return Validity.Valid(version)
    }

    companion object {
        @JvmStatic
        fun getInstance(): ToolManager = service()
    }
}
