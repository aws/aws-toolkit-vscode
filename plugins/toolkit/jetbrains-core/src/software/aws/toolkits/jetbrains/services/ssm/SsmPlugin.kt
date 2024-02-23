// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ssm

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.io.Decompressor
import com.intellij.util.system.CpuArch
import org.jetbrains.annotations.VisibleForTesting
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.getTextFromUrl
import software.aws.toolkits.jetbrains.core.saveFileFromUrl
import software.aws.toolkits.jetbrains.core.tools.BaseToolType
import software.aws.toolkits.jetbrains.core.tools.DocumentedToolType
import software.aws.toolkits.jetbrains.core.tools.FourPartVersion
import software.aws.toolkits.jetbrains.core.tools.ManagedToolType
import software.aws.toolkits.jetbrains.core.tools.Tool
import software.aws.toolkits.jetbrains.core.tools.ToolType
import software.aws.toolkits.jetbrains.core.tools.VersionRange
import software.aws.toolkits.jetbrains.core.tools.until
import software.aws.toolkits.jetbrains.utils.checkSuccess
import software.aws.toolkits.telemetry.ToolId
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import kotlin.streams.asSequence

object SsmPlugin : ManagedToolType<FourPartVersion>, DocumentedToolType<FourPartVersion>, BaseToolType<FourPartVersion>() {
    private val hasDpkg by lazy { hasCommand("dpkg-deb") }
    private val hasRpm2Cpio by lazy { hasCommand("rpm2cpio") }

    override val telemetryId: ToolId = ToolId.SessionManagerPlugin
    override val displayName: String = "AWS Session Manager Plugin"

    override fun supportedVersions(): VersionRange<FourPartVersion> = FourPartVersion(1, 2, 0, 0) until FourPartVersion(2, 0, 0, 0)

    override fun downloadVersion(version: FourPartVersion, destinationDir: Path, indicator: ProgressIndicator?): Path {
        val downloadUrl = when {
            SystemInfo.isWindows -> windowsUrl(version)
            SystemInfo.isMac -> macUrl(version)
            SystemInfo.isLinux && hasDpkg && CpuArch.isArm64() -> ubuntuArm64Url(version)
            SystemInfo.isLinux && hasDpkg && CpuArch.isIntel64() -> ubuntuI64Url(version)
            SystemInfo.isLinux && hasRpm2Cpio && CpuArch.isArm64() -> linuxArm64Url(version)
            SystemInfo.isLinux && hasRpm2Cpio && CpuArch.isIntel64() -> linuxI64Url(version)
            else -> throw IllegalStateException("Failed to find compatible SSM plugin: SystemInfo=${SystemInfo.OS_NAME}, Arch=${SystemInfo.OS_ARCH}")
        }

        val fileName = downloadUrl.substringAfterLast("/")
        val destination = destinationDir.resolve(fileName)

        saveFileFromUrl(downloadUrl, destination, indicator)

        return destination
    }

    override fun installVersion(downloadArtifact: Path, destinationDir: Path, indicator: ProgressIndicator?) {
        when (val extension = downloadArtifact.fileName.toString().substringAfterLast(".")) {
            "zip" -> extractZip(downloadArtifact, destinationDir)
            "rpm" -> runInstall(
                GeneralCommandLine("sh", "-c", """rpm2cpio "$downloadArtifact" | (mkdir -p "$destinationDir" && cd "$destinationDir" && cpio -idmv)""")
            )
            "deb" -> runInstall(GeneralCommandLine("sh", "-c", """mkdir -p "$destinationDir" && dpkg-deb -x "$downloadArtifact" "$destinationDir""""))
            else -> throw IllegalStateException("Unknown extension $extension")
        }
    }

    override fun determineLatestVersion(): FourPartVersion = parseVersion(getTextFromUrl(VERSION_FILE))

    override fun parseVersion(output: String): FourPartVersion = FourPartVersion.parse(output)

    override fun toTool(installDir: Path): Tool<ToolType<FourPartVersion>> {
        val executableName = if (SystemInfo.isWindows) {
            "session-manager-plugin.exe"
        } else {
            "session-manager-plugin"
        }

        return Files.walk(installDir).use { files ->
            files.asSequence().filter { it.fileName.toString() == executableName && Files.isExecutable(it) }
                .map { Tool(this, it) }
                .firstOrNull()
        } ?: throw IllegalStateException("Failed to locate $executableName under $installDir")
    }

    override fun documentationUrl() =
        "https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html"

    @VisibleForTesting
    fun windowsUrl(version: FourPartVersion) = "$BASE_URL/${version.displayValue()}/windows/SessionManagerPlugin.zip"

    @VisibleForTesting
    fun macUrl(version: FourPartVersion) = "$BASE_URL/${version.displayValue()}/mac/sessionmanager-bundle.zip"

    @VisibleForTesting
    fun ubuntuArm64Url(version: FourPartVersion) = "$BASE_URL/${version.displayValue()}/ubuntu_arm64/session-manager-plugin.deb"

    @VisibleForTesting
    fun ubuntuI64Url(version: FourPartVersion) = "$BASE_URL/${version.displayValue()}/ubuntu_64bit/session-manager-plugin.deb"

    @VisibleForTesting
    fun linuxArm64Url(version: FourPartVersion) = "$BASE_URL/${version.displayValue()}/linux_arm64/session-manager-plugin.rpm"

    @VisibleForTesting
    fun linuxI64Url(version: FourPartVersion) = "$BASE_URL/${version.displayValue()}/linux_64bit/session-manager-plugin.rpm"

    private fun runInstall(cmd: GeneralCommandLine) {
        val processOutput = ExecUtil.execAndGetOutput(cmd, INSTALL_TIMEOUT.toMillis().toInt())

        if (!processOutput.checkSuccess(LOGGER)) {
            throw IllegalStateException("Failed to extract $displayName\nSTDOUT:${processOutput.stdout}\nSTDERR:${processOutput.stderr}")
        }
    }

    private fun extractZip(downloadArtifact: Path, destinationDir: Path) {
        val decompressor = Decompressor.Zip(downloadArtifact).withZipExtensions()
        if (!SystemInfo.isWindows) {
            decompressor.extract(destinationDir)
            return
        }

        // on windows there is a zip inside a zip :(
        val tempDir = Files.createTempDirectory(id)
        decompressor.extract(tempDir)

        val intermediateZip = tempDir.resolve("package.zip")
        Decompressor.Zip(intermediateZip).withZipExtensions().extract(destinationDir)
    }

    private fun hasCommand(cmd: String): Boolean {
        val output = ExecUtil.execAndGetOutput(GeneralCommandLine("sh", "-c", "command -v $cmd"), EXECUTION_TIMEOUT.toMillis().toInt())
        return output.exitCode == 0
    }
    private val LOGGER = getLogger<SsmPlugin>()
    private const val BASE_URL = "https://s3.us-east-1.amazonaws.com/session-manager-downloads/plugin"
    private const val VERSION_FILE = "$BASE_URL/latest/VERSION"
    private val EXECUTION_TIMEOUT = Duration.ofSeconds(5)
    private val INSTALL_TIMEOUT = Duration.ofSeconds(30)
}
