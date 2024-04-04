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
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.fileFormatNotSupported
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.fileTooLarge
import software.aws.toolkits.jetbrains.services.codewhisperer.language.programmingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FILE_SCAN_PAYLOAD_SIZE_LIMIT_IN_BYTES
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.SecurityScanType
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_BYTES_IN_KB
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_BYTES_IN_MB
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import kotlin.io.path.relativeTo

sealed class CodeScanSessionConfig(
    private val selectedFile: VirtualFile,
    private val project: Project,
    private val scanType: SecurityScanType
) {
    var projectRoot = project.guessProjectDir() ?: error("Cannot guess base directory for project ${project.name}")
        private set

    abstract val sourceExt: List<String>

    private var isProjectTruncated = false

    /**
     * Timeout for the overall job - "Run Security Scan".
     */
    abstract fun overallJobTimeoutInSeconds(): Long

    abstract fun getPayloadLimitInBytes(): Int

    open fun getFilePayloadLimitInBytes(): Int = FILE_SCAN_PAYLOAD_SIZE_LIMIT_IN_BYTES

    protected fun willExceedPayloadLimit(currentTotalFileSize: Long, currentFileSize: Long): Boolean {
        val exceedsLimit = currentTotalFileSize > getPayloadLimitInBytes() - currentFileSize
        isProjectTruncated = isProjectTruncated || exceedsLimit
        return exceedsLimit
    }

    open fun getImportedFiles(file: VirtualFile, includedSourceFiles: Set<String>): List<String> = listOf()

    open fun getSelectedFile(): VirtualFile = selectedFile

    open fun createPayload(): Payload {
        // Fail fast if the selected file size is greater than the payload limit.
        if (scanType == SecurityScanType.FILE) {
            if (selectedFile.length > getFilePayloadLimitInBytes()) {
                fileTooLarge(getPresentableFilePayloadLimit())
            }
        } else {
            if (selectedFile.length > getPayloadLimitInBytes()) {
                fileTooLarge(getPresentablePayloadLimit())
            }
        }

        val start = Instant.now().toEpochMilli()

        LOG.debug { "Creating payload. File selected as root for the context truncation: ${selectedFile.path}" }

        val payloadMetadata = when (selectedFile.path.startsWith(projectRoot.path)) {
            true -> includeDependencies()
            false -> {
                // Set project root as the parent of the selected file.
                projectRoot = selectedFile.parent
                getFilePayloadMetadata()
            }
        }

        // Copy all the included source files to the source zip
        val srcZip = zipFiles(payloadMetadata.sourceFiles.map { Path.of(it) })
        val payloadContext = PayloadContext(
            selectedFile.programmingLanguage().toTelemetryType(),
            payloadMetadata.linesScanned,
            payloadMetadata.sourceFiles.size,
            Instant.now().toEpochMilli() - start,
            payloadMetadata.sourceFiles.mapNotNull { Path.of(it).toFile().toVirtualFile() },
            payloadMetadata.payloadSize,
            srcZip.length()
        )

        return Payload(payloadContext, srcZip)
    }

    open fun getFilePayloadMetadata(): PayloadMetadata =
        // Handle the case where the selected file is outside the project root.
        PayloadMetadata(
            setOf(selectedFile.path),
            selectedFile.length,
            Files.lines(selectedFile.toNioPath()).count().toLong()
        )

    open fun includeDependencies(): PayloadMetadata {
        val includedSourceFiles = mutableSetOf<String>()
        var currentTotalFileSize = 0L
        var currentTotalLines = 0L
        val files = getSourceFilesUnderProjectRoot(selectedFile, scanType)
        val queue = ArrayDeque<String>()

        if (scanType == SecurityScanType.FILE) {
            return getFilePayloadMetadata()
        } else {
            files.forEach { pivotFile ->
                val filePath = pivotFile.path
                queue.addLast(filePath)

                // BFS
                while (queue.isNotEmpty()) {
                    if (currentTotalFileSize.equals(getPayloadLimitInBytes())) {
                        return PayloadMetadata(includedSourceFiles, currentTotalFileSize, currentTotalLines)
                    }

                    val currentFilePath = queue.removeFirst()
                    val currentFile = File(currentFilePath).toVirtualFile()
                    if (includedSourceFiles.contains(currentFilePath) ||
                        currentFile == null ||
                        willExceedPayloadLimit(currentTotalFileSize, currentFile.length)
                    ) {
                        continue
                    }

                    val currentFileSize = currentFile.length

                    currentTotalFileSize += currentFileSize
                    currentTotalLines += Files.lines(currentFile.toNioPath()).count()
                    includedSourceFiles.add(currentFilePath)
                    getImportedFiles(currentFile, includedSourceFiles).forEach {
                        if (!includedSourceFiles.contains(it)) queue.addLast(it)
                    }
                }
            }
        }

        return PayloadMetadata(includedSourceFiles, currentTotalFileSize, currentTotalLines)
    }

    /**
     * Timeout for creating the payload [createPayload]
     */
    open fun createPayloadTimeoutInSeconds(): Long = CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS

    open fun getPresentablePayloadLimit(): String = when (getPayloadLimitInBytes() >= TOTAL_BYTES_IN_MB) {
        true -> "${getPayloadLimitInBytes() / TOTAL_BYTES_IN_MB}MB"
        false -> "${getPayloadLimitInBytes() / TOTAL_BYTES_IN_KB}KB"
    }

    open fun getPresentableFilePayloadLimit(): String = when (getFilePayloadLimitInBytes() >= TOTAL_BYTES_IN_KB) {
        true -> "${getFilePayloadLimitInBytes() / TOTAL_BYTES_IN_MB}MB"
        false -> "${getFilePayloadLimitInBytes() / TOTAL_BYTES_IN_KB}KB"
    }

    open suspend fun getTotalProjectSizeInBytes(): Long {
        var totalSize = 0L
        try {
            withTimeout(Duration.ofSeconds(TELEMETRY_TIMEOUT_IN_SECONDS)) {
                VfsUtil.collectChildrenRecursively(projectRoot).filter {
                    !it.isDirectory && !it.`is`((VFileProperty.SYMLINK)) && (
                        it.path.endsWith(sourceExt[0]) || (
                            sourceExt.getOrNull(1) != null && it.path.endsWith(
                                sourceExt[1]
                            )
                            )
                        )
                }.fold(0L) { acc, next ->
                    totalSize = acc + next.length
                    totalSize
                }
            }
        } catch (e: TimeoutCancellationException) {
            // Do nothing
        }
        return totalSize
    }

    protected fun zipFiles(files: List<Path>): File = createTemporaryZipFile {
        files.forEach { file ->
            val relativePath = file.relativeTo(projectRoot.toNioPath())
            LOG.debug { "Selected file for truncation: $file" }
            it.putNextEntry(relativePath.toString(), file)
        }
    }.toFile()

    /**
     * Returns all the source files for a given payload type.
     */
    open fun getSourceFilesUnderProjectRoot(selectedFile: VirtualFile, scanType: SecurityScanType): List<VirtualFile> {
        //  Include the current selected file
        val files = mutableListOf(selectedFile)
        //  Include only the file if scan type is file scan.
        if (scanType == SecurityScanType.FILE) {
            return files
        } else {
            // Include other files only if the current file is in the project.
            if (selectedFile.path.startsWith(projectRoot.path)) {
                files.addAll(
                    VfsUtil.collectChildrenRecursively(projectRoot).filter {
                        (it.path.endsWith(sourceExt[0]) || (sourceExt.getOrNull(1) != null && it.path.endsWith(sourceExt[1]))) && it != selectedFile
                    }
                )
            }
            return files
        }
    }

    open fun isProjectTruncated() = isProjectTruncated

    protected fun getPath(root: String, relativePath: String = ""): Path? = try {
        Path.of(root, relativePath).normalize()
    } catch (e: Exception) {
        LOG.debug { "Cannot find file at path $relativePath relative to the root $root" }
        null
    }

    protected fun File.toVirtualFile() = LocalFileSystem.getInstance().findFileByIoFile(this)

    companion object {
        private val LOG = getLogger<CodeScanSessionConfig>()
        private const val TELEMETRY_TIMEOUT_IN_SECONDS: Long = 10
        const val FILE_SEPARATOR = '/'
        fun create(file: VirtualFile, project: Project, scanType: SecurityScanType): CodeScanSessionConfig =
            when (file.programmingLanguage().toTelemetryType()) {
                CodewhispererLanguage.Java -> JavaCodeScanSessionConfig(file, project, scanType)
                CodewhispererLanguage.Python -> PythonCodeScanSessionConfig(file, project, scanType)
                CodewhispererLanguage.Javascript -> JavaScriptCodeScanSessionConfig(file, project, CodewhispererLanguage.Javascript, scanType)
                CodewhispererLanguage.Typescript -> JavaScriptCodeScanSessionConfig(file, project, CodewhispererLanguage.Typescript, scanType)
                CodewhispererLanguage.Csharp -> CsharpCodeScanSessionConfig(file, project, scanType)
                CodewhispererLanguage.Yaml -> CloudFormationYamlCodeScanSessionConfig(file, project, scanType)
                CodewhispererLanguage.Json -> CloudFormationJsonCodeScanSessionConfig(file, project, scanType)
                CodewhispererLanguage.Tf,
                CodewhispererLanguage.Hcl -> TerraformCodeScanSessionConfig(file, project, scanType)
                CodewhispererLanguage.Go -> GoCodeScanSessionConfig(file, project, scanType)
                CodewhispererLanguage.Ruby -> RubyCodeScanSessionConfig(file, project, scanType)
                else -> fileFormatNotSupported(file.extension ?: "")
            }
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
    val buildPaths: Set<String> = setOf()
)
