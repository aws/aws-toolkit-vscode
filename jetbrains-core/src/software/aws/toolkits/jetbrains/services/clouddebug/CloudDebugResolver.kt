// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.text.SemVer
import org.apache.commons.codec.digest.DigestUtils
import software.aws.toolkits.jetbrains.core.executables.CloudDebugExecutable
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableType
import software.aws.toolkits.jetbrains.core.getTextFromUrl
import software.aws.toolkits.jetbrains.core.saveFileFromUrl
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Context
import software.aws.toolkits.jetbrains.services.clouddebug.execution.MessageEmitter
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.CloudDebugCliValidate
import software.aws.toolkits.jetbrains.services.clouddebug.resources.CloudDebuggingResources
import software.aws.toolkits.jetbrains.utils.ZipDecompressor
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ClouddebugTelemetry
import software.aws.toolkits.telemetry.Result
import java.net.URL
import java.nio.file.Files
import java.time.Duration
import java.time.Instant

object CloudDebugResolver {
    private const val URL_PREFIX = "https://cloud-debug.amazonwebservices.com/release/metadata"
    private const val URL_LATEST_VERSION = "latest-version"
    private const val URL_RELEASE_JSON = "release-metadata.json"

    private val mapper by lazy { jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES) }

    /**
     * Checks the current cloud-debug CLI version, and updates the version of a newer version is available.
     * If a user specifies their own executable, we will not attempt the download and still use it, even if the version is invalid
     * (invalid versions will still be met with errors by any validating code)
     *
     * @param project: Project
     * @param messageEmitter: MessageEmitter (remove this in favor of a message emitter in the object?)
     * @param context: Context (optional), used by steps to set attributes for other steps in the workflows
     */
    fun validateOrUpdateCloudDebug(project: Project, messageEmitter: MessageEmitter, context: Context?) {
        var currentExecutable: ExecutableInstance.Executable? = null
        var currentVersion: String? = null

        // do we already have an executable? If so, get it so we can check version against it
        try {
            currentExecutable = CloudDebugCliValidate.validateAndLoadCloudDebugExecutable()
            context?.putAttribute(CloudDebugCliValidate.EXECUTABLE_ATTRIBUTE, currentExecutable)
            currentVersion = currentExecutable.version
            messageEmitter.emitMessage(message("cloud_debug.step.clouddebug.validate.success", currentVersion), false)
        } catch (e: RuntimeException) {
            // existing executable had some sort of an error
            // swallow it and attempt an update; doesn't matter if this is broken if we can give them something that works
        }

        // if we have an executable and it's not autoresolved (read: a user manually set it), always default to that.
        // NOTE: If a user is purposefully using an invalid version, currentExecutable will be null
        //       This will trigger the install process and, if successful, the user will be reverted to the new, autoresolved version
        if (currentExecutable != null && !currentExecutable.autoResolved) {
            messageEmitter.emitMessage(message("cloud_debug.step.clouddebug.resolution.auto"), false)
            return
        }
        attemptToUpdateCloudDebug(project, messageEmitter, currentExecutable, currentVersion, context)
    }

    private fun attemptToUpdateCloudDebug(
        project: Project,
        messageEmitter: MessageEmitter,
        currentExecutable: ExecutableInstance.Executable?,
        currentVersion: String?,
        context: Context?
    ) {
        try {
            messageEmitter.emitMessage(message("cloud_debug.step.clouddebug.update_check"), false)
            val upstreamExecutableVersion = getUpstreamCloudDebugVersion()
            // install if we don't have an executable or if we're out of date
            if (currentExecutable == null || upstreamExecutableVersion > SemVer.parseFromText(currentVersion)) {
                // If we are out of date, also run shutdown
                if (currentExecutable != null && upstreamExecutableVersion > SemVer.parseFromText(currentVersion)) {
                    CloudDebuggingResources.shutdownCloudDebugDispatcher()
                }

                val manifest = getCloudDebugManifestForVersion(upstreamExecutableVersion)
                messageEmitter.emitMessage(message("cloud_debug.step.clouddebug.install.initiate", manifest.version), false)
                installCloudDebugCli(
                    manifest,
                    project,
                    currentVersion
                )

                // clear the executable cache after install
                ExecutableManager.getInstance().removeExecutable(ExecutableType.getInstance<CloudDebugExecutable>())
                context?.putAttribute(CloudDebugCliValidate.EXECUTABLE_ATTRIBUTE, CloudDebugCliValidate.validateAndLoadCloudDebugExecutable())
                messageEmitter.emitMessage(message("cloud_debug.step.clouddebug.install.success"), false)
            } else {
                messageEmitter.emitMessage(message("cloud_debug.step.clouddebug.up_to_date"), false)
                return
            }
        } catch (e: Exception) {
            // throw an error if the user doesn't have an existing executable AND couldn't reach the manifest
            // otherwise, use existing executable
            messageEmitter.emitMessage(e.message.toString(), true)
            if (currentExecutable != null) {
                messageEmitter.emitMessage("cloud_debug.step.clouddebug.update_check.fail_with_existing", false)
            } else {
                throw e
            }
        }
    }

    /**
     * Validates and installs a cloud debug executable from a given URL
     * @param manifest: CloudDebugManifest
     * TODO: add a progress indicator
     */
    private fun installCloudDebugCli(manifest: CloudDebugManifest, project: Project, oldVersion: String?) {
        val startTime = Instant.now()
        try {
            // TODO: Consider a way to handle input stream directly? HttpRequests/Decompressor can do this if we have a tar.gz
            val zipFile = Files.createTempFile("cloud-debug", ".zip")
            // TODO: add progress indicator, preferably to this implementation as this is synchronous.
            saveFileFromUrl(manifest.location, zipFile, null)

            // checksum checker
            val zipSignature = DigestUtils.sha256Hex(Files.readAllBytes(zipFile))
            if (zipSignature != manifest.checksum) {
                throw RuntimeException(message("cloud_debug.step.clouddebug.checksum.fail"))
            }

            val directory = ExecutableType.EXECUTABLE_DIRECTORY.toFile()
            ZipDecompressor(zipFile.toFile()).use {
                it.extract(directory)
            }
            emitInstallMetric(
                Result.Succeeded,
                project,
                startTime,
                manifest.version,
                oldVersion
            )
        } catch (e: Exception) {
            emitInstallMetric(Result.Failed, project, startTime, null, oldVersion)
            throw e
        }
    }

    private fun generateCloudDebugManifestUrl(suffix: String): String {
        if (!SystemInfo.is64Bit) {
            throw RuntimeException("Cloud Debugging requires a 64-bit OS")
        }
        val os = when {
            SystemInfo.isWindows -> "windows_amd64"
            SystemInfo.isMac -> "darwin_amd64"
            SystemInfo.isLinux -> "linux_amd64"
            else -> throw RuntimeException("Unrecognized OS!")
        }
        return "$URL_PREFIX/$os/$suffix"
    }

    private fun getLatestMinorVersionUrl(majorVersion: String): String =
        generateCloudDebugManifestUrl("$majorVersion/$URL_LATEST_VERSION")

    private fun getLatestPatchVersionUrl(majorVersion: String, majorAndMinorVersion: String): String =
        generateCloudDebugManifestUrl("$majorVersion/$majorAndMinorVersion/$URL_LATEST_VERSION")

    private fun getExecutableManifestUrl(executableVersion: SemVer): String =
        generateCloudDebugManifestUrl(
            "${executableVersion.major}/${executableVersion.major}.${executableVersion.minor}/$executableVersion/$URL_RELEASE_JSON"
        )

    /**
     * Pulls the latest valid version
     * A valid version matches the major and minor versions of the minimum version, while looking for the latest patch version
     */
    private fun getUpstreamCloudDebugVersion(): SemVer {
        val validMajor = "${CloudDebugExecutable.MIN_VERSION.major}"
        val validMajorAndMinor = getTextFromUrl(getLatestMinorVersionUrl(validMajor))
        return SemVer.parseFromText(getTextFromUrl(getLatestPatchVersionUrl(validMajor, validMajorAndMinor)))
            ?: throw RuntimeException(message("cloud_debug.step.clouddebug.update_check.fail"))
    }

    /**
     * Pulls the manifest data for the given version
     * @param version: SemVer version to pull data for
     */
    private fun getCloudDebugManifestForVersion(version: SemVer): CloudDebugManifest = mapper.readValue<CloudDebugManifest>(
        URL(getExecutableManifestUrl(version)),
        CloudDebugManifest::class.java
    )

    private fun emitInstallMetric(
        result: Result,
        project: Project,
        startTime: Instant,
        newVersion: String?,
        oldVersion: String?
    ) {
        ClouddebugTelemetry.install(
            project,
            version = newVersion.toString(),
            oldversion = oldVersion.toString(),
            result = result,
            value = Duration.between(startTime, Instant.now()).toMillis().toDouble(),
            createTime = startTime
        )
    }

    data class CloudDebugManifest(
        val name: String,
        val location: String,
        val platform: String,
        val version: String,
        val checksum: String,
        @JsonProperty("cloud-debug-commit") val commit: String
    )
}
