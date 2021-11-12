// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.progress.ProgressIndicator
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.ssm.SsmPlugin
import software.aws.toolkits.jetbrains.utils.checkSuccess
import software.aws.toolkits.telemetry.ToolId
import java.nio.file.Path

/**
 * Represents an executable external tool such as a CLI
 *
 * Note: It is recommended that all implementations of this interface are stateless and are an `object`
 */
interface ToolType<VersionScheme : Version> {
    /**
     * ID used to represent the executable in caches and settings. Must be globally unique
     */
    val id: String

    /**
     * Name of the executable for users, e.g. the marketing name of the executable
     */
    val displayName: String

    /**
     * List of supported [VersionRange]. An empty list means any version is supported
     */
    fun supportedVersions(): VersionRange<VersionScheme>?

    /**
     * Returns the [Version] for the executable of this type located at the specified location
     */
    fun determineVersion(path: Path): VersionScheme

    companion object {
        internal val EP_NAME = ExtensionPointName.create<DocumentedToolType<Version>>("aws.toolkit.tool")
    }
}

/**
 * Used to power the 'Learn more' link in the configurable
 */
interface DocumentedToolType<VersionScheme : Version> : ToolType<VersionScheme> {
    fun documentationUrl(): String
}

/**
 * Indicates that a [ToolType] can be auto-detected for the user on their system
 */
interface AutoDetectableToolType<VersionScheme : Version> : ToolType<VersionScheme> {
    /**
     * Attempt to automatically detect the tool's binary file
     *
     * @return the resolved path or null if not found
     * @throws Exception if an exception occurred attempting to resolve the path
     */
    fun resolve(): Path?
}

interface ManagedToolType<VersionScheme : Version> : ToolType<VersionScheme> {
    override val id: String
        get() = telemetryId.toString()

    /**
     * Used to identify this tool with the telemetry stack
     */
    val telemetryId: ToolId
    fun determineLatestVersion(): VersionScheme
    fun downloadVersion(version: VersionScheme, destinationDir: Path, indicator: ProgressIndicator?): Path
    fun installVersion(downloadArtifact: Path, destinationDir: Path, indicator: ProgressIndicator?)
    fun toTool(installDir: Path): Tool<ToolType<VersionScheme>>
}

abstract class BaseToolType<VersionScheme : Version> : ToolType<VersionScheme> {
    final override fun determineVersion(path: Path): VersionScheme {
        val processOutput = ExecUtil.execAndGetOutput(GeneralCommandLine(path.toString()).apply(::versionCommand), VERSION_TIMEOUT_MS)

        if (!processOutput.checkSuccess(LOGGER)) {
            throw IllegalStateException("Failed to determine version of ${SsmPlugin.displayName}")
        }
        return parseVersion(processOutput.stdout.trim())
    }

    /**
     * Used as a hook to call executable with parameters to determine version.
     *
     * [baseCmd] is a [GeneralCommandLine] with the [Tool.path] as the base
     */
    open fun versionCommand(baseCmd: GeneralCommandLine) {
        baseCmd.withParameters("--version")
    }

    /**
     * Parse the version from standard out
     */
    abstract fun parseVersion(output: String): VersionScheme

    companion object {
        private const val VERSION_TIMEOUT_MS = 5000
        private val LOGGER = getLogger<BaseToolType<*>>()
    }
}
