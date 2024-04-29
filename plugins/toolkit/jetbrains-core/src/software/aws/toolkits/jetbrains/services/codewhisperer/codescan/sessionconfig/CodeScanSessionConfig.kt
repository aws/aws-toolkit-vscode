// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig

import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VFileProperty
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.time.withTimeout
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.amazonq.FeatureDevSessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.fileTooLarge
import software.aws.toolkits.jetbrains.services.codewhisperer.language.programmingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CodeAnalysisScope
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.DEFAULT_CODE_SCAN_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.DEFAULT_PAYLOAD_LIMIT_IN_BYTES
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FILE_SCAN_PAYLOAD_SIZE_LIMIT_IN_BYTES
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FILE_SCAN_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_BYTES_IN_KB
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_BYTES_IN_MB
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.Stack
import kotlin.io.path.relativeTo

class CodeScanSessionConfig(
    private val selectedFile: VirtualFile,
    private val project: Project,
    private val scope: CodeAnalysisScope
) {
    var projectRoot = project.basePath?.let { Path.of(it) }?.toFile()?.toVirtualFile() ?: run {
        project.guessProjectDir() ?: error("Cannot guess base directory for project ${project.name}")
    }
        private set

    private var isProjectTruncated = false

    private val featureDevSessionContext = FeatureDevSessionContext(project)

    /**
     * Timeout for the overall job - "Run Security Scan".
     */
    fun overallJobTimeoutInSeconds(): Long = when (scope) {
        CodeAnalysisScope.FILE -> FILE_SCAN_TIMEOUT_IN_SECONDS
        else -> DEFAULT_CODE_SCAN_TIMEOUT_IN_SECONDS
    }

    fun getPayloadLimitInBytes(): Long = when (scope) {
        CodeAnalysisScope.FILE -> (FILE_SCAN_PAYLOAD_SIZE_LIMIT_IN_BYTES)
        else -> (DEFAULT_PAYLOAD_LIMIT_IN_BYTES)
    }

    private fun willExceedPayloadLimit(currentTotalFileSize: Long, currentFileSize: Long): Boolean {
        val exceedsLimit = currentTotalFileSize > getPayloadLimitInBytes() - currentFileSize
        isProjectTruncated = isProjectTruncated || exceedsLimit
        return exceedsLimit
    }

    fun getSelectedFile(): VirtualFile = selectedFile

    fun createPayload(): Payload {
        // Fail fast if the selected file size is greater than the payload limit.
        if (selectedFile.length > getPayloadLimitInBytes()) {
            fileTooLarge(getPresentablePayloadLimit())
        }

        val start = Instant.now().toEpochMilli()

        LOG.debug { "Creating payload. File selected as root for the context truncation: ${selectedFile.path}" }

        val payloadMetadata = when (selectedFile.path.startsWith(projectRoot.path)) {
            true -> when (scope) {
                CodeAnalysisScope.PROJECT -> getProjectPayloadMetadata()
                CodeAnalysisScope.FILE -> getFilePayloadMetadata()
            }
            false -> {
                // Set project root as the parent of the selected file.
                projectRoot = selectedFile.parent
                getFilePayloadMetadata()
            }
        }

        // Copy all the included source files to the source zip
        val srcZip = zipFiles(payloadMetadata.sourceFiles.map { Path.of(it) })
        val payloadContext = PayloadContext(
            payloadMetadata.language,
            payloadMetadata.linesScanned,
            payloadMetadata.sourceFiles.size,
            Instant.now().toEpochMilli() - start,
            payloadMetadata.sourceFiles.mapNotNull { Path.of(it).toFile().toVirtualFile() },
            payloadMetadata.payloadSize,
            srcZip.length()
        )

        return Payload(payloadContext, srcZip)
    }

    fun getFilePayloadMetadata(): PayloadMetadata =
        // Handle the case where the selected file is outside the project root.
        PayloadMetadata(
            setOf(selectedFile.path),
            selectedFile.length,
            Files.lines(selectedFile.toNioPath()).count().toLong(),
            selectedFile.programmingLanguage().toTelemetryType()
        )

    /**
     * Timeout for creating the payload [createPayload]
     */
    fun createPayloadTimeoutInSeconds(): Long = CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS

    fun getPresentablePayloadLimit(): String = when (getPayloadLimitInBytes() >= TOTAL_BYTES_IN_MB) {
        true -> "${getPayloadLimitInBytes() / TOTAL_BYTES_IN_MB}MB"
        false -> "${getPayloadLimitInBytes() / TOTAL_BYTES_IN_KB}KB"
    }

    private fun countLinesInVirtualFile(virtualFile: VirtualFile): Int {
        val bufferedReader = virtualFile.inputStream.bufferedReader()
        return bufferedReader.useLines { lines -> lines.count() }
    }

    suspend fun getTotalProjectSizeInBytes(): Long {
        var totalSize = 0L
        try {
            withTimeout(Duration.ofSeconds(TELEMETRY_TIMEOUT_IN_SECONDS)) {
                if (scope == CodeAnalysisScope.FILE) {
                    totalSize = selectedFile.length
                } else {
                    VfsUtil.collectChildrenRecursively(projectRoot).filter {
                        !it.isDirectory && !it.`is`((VFileProperty.SYMLINK)) && (
                            !featureDevSessionContext.ignoreFile(it)
                            )
                    }.fold(0L) { acc, next ->
                        totalSize = acc + next.length
                        totalSize
                    }
                }
            }
        } catch (e: TimeoutCancellationException) {
            // Do nothing
        }
        return totalSize
    }

    private fun zipFiles(files: List<Path>): File = createTemporaryZipFile {
        files.forEach { file ->
            val relativePath = file.relativeTo(projectRoot.toNioPath())
            LOG.debug { "Selected file for truncation: $file" }
            it.putNextEntry(relativePath.toString(), file)
        }
    }.toFile()

    fun getProjectPayloadMetadata(): PayloadMetadata {
        val files = mutableSetOf<String>()
        val stack = Stack<VirtualFile>()
        var currentTotalFileSize = 0L
        var currentTotalLines = 0L
        val languageCounts = mutableMapOf<CodewhispererLanguage, Int>()

        stack.push(projectRoot)
        while (stack.isNotEmpty()) {
            val current = stack.pop()

            if (!current.isDirectory) {
                if (!featureDevSessionContext.ignoreFile(current)) {
                    if (willExceedPayloadLimit(currentTotalFileSize, current.length)) {
                        break
                    } else {
                        val language = current.programmingLanguage().toTelemetryType()
                        if (language != CodewhispererLanguage.Plaintext && language != CodewhispererLanguage.Unknown) {
                            languageCounts[language] = (languageCounts[language] ?: 0) + 1
                        }

                        files.add(current.path)
                        currentTotalFileSize += current.length
                        currentTotalLines += countLinesInVirtualFile(current)
                    }
                }
            } else {
                // Directory case: only traverse if not ignored
                if (!featureDevSessionContext.ignoreFile(current)) {
                    for (child in current.children) {
                        stack.push(child)
                    }
                }
            }
        }
        val maxCount = languageCounts.maxByOrNull { it.value }?.value ?: 0
        val maxCountLanguage = languageCounts.filter { it.value == maxCount }.keys.firstOrNull()

        if (maxCountLanguage == null) {
            return PayloadMetadata(files, currentTotalFileSize, currentTotalLines, CodewhispererLanguage.Unknown)
        }
        return PayloadMetadata(files, currentTotalFileSize, currentTotalLines, maxCountLanguage)
    }

    fun isProjectTruncated() = isProjectTruncated

    fun getPath(root: String, relativePath: String = ""): Path? = try {
        Path.of(root, relativePath).normalize()
    } catch (e: Exception) {
        LOG.debug { "Cannot find file at path $relativePath relative to the root $root" }
        null
    }

    fun File.toVirtualFile() = LocalFileSystem.getInstance().findFileByIoFile(this)

    companion object {
        private val LOG = getLogger<CodeScanSessionConfig>()
        private const val TELEMETRY_TIMEOUT_IN_SECONDS: Long = 10
        fun create(file: VirtualFile, project: Project, scope: CodeAnalysisScope): CodeScanSessionConfig = CodeScanSessionConfig(file, project, scope)
    }
}

data class Payload(
    val context: PayloadContext,
    val srcZip: File
)

data class PayloadContext(
    val language: CodewhispererLanguage,
    val totalLines: Long,
    val totalFiles: Int,
    val totalTimeInMilliseconds: Long,
    val scannedFiles: List<VirtualFile>,
    val srcPayloadSize: Long,
    val srcZipFileSize: Long,
    val buildPayloadSize: Long? = null
)

data class PayloadMetadata(
    val sourceFiles: Set<String>,
    val payloadSize: Long,
    val linesScanned: Long,
    val language: CodewhispererLanguage
)
