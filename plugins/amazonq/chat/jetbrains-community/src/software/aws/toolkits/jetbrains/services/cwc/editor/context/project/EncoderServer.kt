// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.project

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.KillableProcessHandler
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.process.ProcessCloseUtil
import com.intellij.util.io.HttpRequests
import com.intellij.util.io.createDirectories
import com.intellij.util.net.NetUtils
import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import org.apache.commons.codec.digest.DigestUtils
import software.amazon.awssdk.utils.UserHomeDirectoryUtils
import software.aws.toolkits.core.utils.createParentDirectories
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.tryDirOp
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.cwc.editor.context.project.manifest.ManifestManager
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermission
import java.security.Key
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.atomic.AtomicInteger
import java.util.zip.ZipFile
import javax.crypto.spec.SecretKeySpec

class EncoderServer(val project: Project) : Disposable {
    private val cachePath = Paths.get(
        UserHomeDirectoryUtils.userHomeDirectory()
    ).resolve(".aws").resolve("amazonq").resolve("cache")
    val manifestManager = ManifestManager()
    private val serverDirectoryName = "qserver-${manifestManager.currentVersion}.zip"
    private val numberOfRetry = AtomicInteger(0)
    val port by lazy { NetUtils.findAvailableSocketPort() }
    private val nodeRunnableName = if (manifestManager.getOs() == "windows") "node.exe" else "node"
    private val maxRetry: Int = 3
    val key = generateHmacKey()
    private var processHandler: KillableProcessHandler? = null
    private val mapper = jacksonObjectMapper()

    fun downloadArtifactsAndStartServer() {
        downloadArtifactsIfNeeded()
        start()
    }

    fun isNodeProcessRunning() = processHandler != null && processHandler?.process?.isAlive == true

    private fun generateHmacKey(): Key {
        val keyBytes = ByteArray(32)
        SecureRandom().nextBytes(keyBytes)
        return SecretKeySpec(keyBytes, "HmacSHA256")
    }

    fun encrypt(data: String): String {
        val header = JWSHeader.Builder(JWSAlgorithm.HS256)
            .type(JOSEObjectType.JWT)
            .build()

        val claimsSet = JWTClaimsSet.Builder()
            .subject(Base64.getUrlEncoder().withoutPadding().encodeToString(data.toByteArray()))
            .build()

        val signedJWT = SignedJWT(header, claimsSet)
        signedJWT.sign(MACSigner(key.encoded))

        return signedJWT.serialize()
    }

    data class EncryptionRequest(
        val version: String = "1.0",
        val mode: String = "JWT",
        val key: String,
    )

    fun getEncryptionRequest(): String {
        val request = EncryptionRequest(key = Base64.getUrlEncoder().withoutPadding().encodeToString(key.encoded))
        return mapper.writeValueAsString(request)
    }

    private fun runCommand(command: GeneralCommandLine): Boolean {
        try {
            logger.info { "starting encoder server for project context on $port for ${project.name}" }
            processHandler = KillableProcessHandler(command)
            val exitCode = processHandler?.waitFor()
            if (exitCode == true) {
                throw Exception("Encoder server exited")
            } else {
                return true
            }
        } catch (e: Exception) {
            logger.warn(e) { "error running encoder server:" }
            processHandler?.destroyProcess()
            numberOfRetry.incrementAndGet()
            return false
        }
    }

    private fun getCommand(): GeneralCommandLine {
        val threadCount = CodeWhispererSettings.getInstance().getProjectContextIndexThreadCount()
        val isGpuEnabled = CodeWhispererSettings.getInstance().isProjectContextGpu()
        val map = mutableMapOf<String, String>(
            "PORT" to port.toString(),
            "START_AMAZONQ_LSP" to "true",
            "CACHE_DIR" to cachePath.toString(),
            "MODEL_DIR" to cachePath.resolve("qserver").toString()
        )
        if (threadCount > 0) {
            map["Q_WORKER_THREADS"] = threadCount.toString()
        }
        if (isGpuEnabled) {
            map["Q_ENABLE_GPU"] = "true"
        }
        val jsPath = cachePath.resolve("qserver").resolve("dist").resolve("extension.js").toString()
        val nodePath = cachePath.resolve(nodeRunnableName).toString()
        val command = GeneralCommandLine(nodePath, jsPath)
            .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
            .withEnvironment(map)
        return command
    }

    fun start() {
        while (numberOfRetry.get() < maxRetry) {
            val isSuccess = runCommand(getCommand())
            if (isSuccess) {
                return
            }
        }
    }

    private fun close() {
        processHandler?.process?.let { ProcessCloseUtil.close(it) }
    }

    private fun downloadArtifactsIfNeeded() {
        cachePath.tryDirOp(logger) { createDirectories() }
        val nodePath = cachePath.resolve(nodeRunnableName)
        val zipFilePath = cachePath.resolve(serverDirectoryName)
        val manifest = manifestManager.getManifest() ?: return
        try {
            if (!Files.exists(nodePath)) {
                val nodeContent = manifestManager.getNodeContentFromManifest(manifest)
                if (nodeContent?.url != null) {
                    val bytes = HttpRequests.request(nodeContent.url).readBytes(null)
                    if (validateHash(nodeContent.hashes?.first(), bytes)) {
                        downloadFromRemote(nodeContent.url, nodePath)
                    }
                }
            }
            if (manifestManager.currentOs != "windows") {
                makeFileExecutable(nodePath)
            }
            val files = cachePath.toFile().listFiles()
            if (files.isNotEmpty()) {
                val filenames = files.map { it.name }
                if (filenames.contains(serverDirectoryName)) {
                    return
                }
                tryDeleteOldArtifacts(filenames)
            }

            val serverContent = manifestManager.getZipContentFromManifest(manifest)
            if (serverContent?.url != null) {
                if (validateHash(serverContent.hashes?.first(), HttpRequests.request(serverContent.url).readBytes(null))) {
                    downloadFromRemote(serverContent.url, zipFilePath)
                    unzipFile(zipFilePath, cachePath)
                }
            }
        } catch (e: Exception) {
            logger.warn(e) { "error downloading artifacts:" }
        }
    }

    private fun tryDeleteOldArtifacts(filenames: List<String>) {
        try {
            filenames.forEach { filename ->
                if (filename.contains("qserver")) {
                    val parts = filename.split("-")
                    val version = if (parts.size > 1) parts[1] else null
                    if (version != null && version != "${manifestManager.currentVersion}.zip") {
                        Files.deleteIfExists(cachePath.resolve(filename))
                        Files.deleteIfExists(cachePath.resolve("qserver"))
                    }
                }
            }
        } catch (e: Exception) {
            logger.warn(e) { "error deleting old artifacts:" }
        }
    }

    fun validateHash(expectedHash: String?, input: ByteArray): Boolean {
        if (expectedHash == null) { return false }
        val sha384 = DigestUtils.sha384Hex(input)
        val isValid = ("sha384:$sha384") == expectedHash
        if (!isValid) {
            logger.warn { "failed validating hash for artifacts $expectedHash" }
        }
        return isValid
    }

    private fun makeFileExecutable(filePath: Path) {
        val permissions = setOf(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE,
            PosixFilePermission.OWNER_EXECUTE,
            PosixFilePermission.GROUP_READ,
            PosixFilePermission.GROUP_EXECUTE,
            PosixFilePermission.OTHERS_READ,
            PosixFilePermission.OTHERS_EXECUTE,
        )
        Files.setPosixFilePermissions(filePath, permissions)
    }

    private fun unzipFile(zipFilePath: Path, destDir: Path) {
        if (!zipFilePath.exists()) return
        try {
            val zipFile = ZipFile(zipFilePath.toFile())
            zipFile.use { file ->
                file.entries().asSequence()
                    .filterNot { it.isDirectory }
                    .map { zipEntry ->
                        val destPath = destDir.resolve(zipEntry.name)
                        destPath.createParentDirectories()
                        FileOutputStream(destPath.toFile()).use { targetFile ->
                            zipFile.getInputStream(zipEntry).copyTo(targetFile)
                        }
                    }.toList()
            }
        } catch (e: Exception) {
            logger.warn { "error while unzipping project context artifact: ${e.message}" }
        }
    }

    private fun downloadFromRemote(url: String, path: Path) {
        try {
            HttpRequests.request(url).saveToFile(path, null)
        } catch (e: IOException) {
            logger.warn { "error downloading from remote ${e.message}" }
        }
    }

    override fun dispose() {
        close()
    }

    companion object {
        private val logger = getLogger<EncoderServer>()
    }
}
