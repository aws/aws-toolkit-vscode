// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.project.manifest

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.system.CpuArch
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.getTextFromUrl

class ManifestManager {
    private val cloudFrontUrl = "https://aws-toolkit-language-servers.amazonaws.com/q-context/manifest.json"
    val currentVersion = "0.1.3"
    val currentOs = getOs()
    private val arch = CpuArch.CURRENT
    private val mapper = jacksonObjectMapper()

    data class TargetContent(
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonProperty("filename")
        val filename: String? = null,
        @JsonProperty("url")
        val url: String? = null,
        @JsonProperty("hashes")
        val hashes: List<String>? = emptyList(),
        @JsonProperty("bytes")
        val bytes: Number? = null
    )

    data class VersionTarget(
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonProperty("platform")
        val platform: String? = null,
        @JsonProperty("arch")
        val arch: String? = null,
        @JsonProperty("contents")
        val contents: List<TargetContent>? = emptyList()
    )
    data class Version(
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonProperty("serverVersion")
        val serverVersion: String? = null,
        @JsonProperty("isDelisted")
        val isDelisted: Boolean? = null,
        @JsonProperty("targets")
        val targets: List<VersionTarget>? = emptyList()
    )

    data class Manifest(
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonProperty("manifestSchemaVersion")
        val manifestSchemaVersion: String? = null,
        @JsonProperty("artifactId")
        val artifactId: String? = null,
        @JsonProperty("artifactDescription")
        val artifactDescription: String? = null,
        @JsonProperty("isManifestDeprecated")
        val isManifestDeprecated: Boolean? = null,
        @JsonProperty("versions")
        val versions: List<Version>? = emptyList()
    )

    fun getManifest(): Manifest? = fetchFromRemoteAndSave()

    private fun readManifestFile(content: String): Manifest? {
        try {
            return mapper.readValue<Manifest>(content)
        } catch (e: Exception) {
            logger.warn { "error parsing manifest file for project context ${e.message}" }
            return null
        }
    }

    private fun getTargetFromManifest(manifest: Manifest): VersionTarget? {
        val targets = manifest.versions?.find { version -> version.serverVersion != null && (version.serverVersion.contains(currentVersion)) }?.targets
        if (targets.isNullOrEmpty()) {
            return null
        }
        val targetArch = if (currentOs != "windows" && arch == CpuArch.ARM64) "arm64" else "x64"
        return targets.find { target -> target.platform == currentOs && target.arch == targetArch }
    }

    fun getNodeContentFromManifest(manifest: Manifest): TargetContent? {
        val target = getTargetFromManifest(manifest) ?: return null
        return target.contents?.find { content -> content.filename?.contains("node") == true }
    }

    fun getZipContentFromManifest(manifest: Manifest): TargetContent? {
        val target = getTargetFromManifest(manifest) ?: return null
        return target.contents?.find { content -> content.filename?.contains("qserver") == true }
    }

    private fun fetchFromRemoteAndSave(): Manifest? {
        try {
            val response = getTextFromUrl(cloudFrontUrl)
            return readManifestFile(response)
        } catch (e: Exception) {
            logger.warn { "failed to save manifest from remote: ${e.message}" }
            return null
        }
    }

    fun getOs(): String =
        when {
            SystemInfo.isWindows -> "windows"
            SystemInfo.isMac -> "darwin"
            SystemInfo.isLinux -> "linux"
            else -> "linux"
        }

    companion object {
        private val logger = getLogger<ManifestManager>()
    }
}
