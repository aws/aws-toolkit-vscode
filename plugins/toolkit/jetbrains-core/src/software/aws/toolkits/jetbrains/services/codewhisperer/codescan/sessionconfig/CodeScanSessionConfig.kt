// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig

import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessModuleDir
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.project.modules
import com.intellij.openapi.vcs.changes.ChangeListManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.fileTooLarge
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.noFileOpenError
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.noSupportedFilesError
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPlainText
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererUnknownLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.programmingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CodeAnalysisScope
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.DEFAULT_CODE_SCAN_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.DEFAULT_PAYLOAD_LIMIT_IN_BYTES
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FILE_SCAN_PAYLOAD_SIZE_LIMIT_IN_BYTES
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FILE_SCAN_TIMEOUT_IN_SECONDS
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.util.Stack
import kotlin.io.path.relativeTo

class CodeScanSessionConfig(
    private val selectedFile: VirtualFile?,
    private val project: Project,
    private val scope: CodeAnalysisScope
) {
    var projectRoot = project.basePath?.let { Path.of(it) }?.toFile()?.toVirtualFile() ?: run {
        project.guessProjectDir() ?: error("Cannot guess base directory for project ${project.name}")
    }
        private set

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

    private fun willExceedPayloadLimit(currentTotalFileSize: Long, currentFileSize: Long): Boolean =
        currentTotalFileSize.let { totalSize -> totalSize > (getPayloadLimitInBytes() - currentFileSize) }

    private var programmingLanguage: CodeWhispererProgrammingLanguage = selectedFile?.programmingLanguage() ?: CodeWhispererUnknownLanguage.INSTANCE

    fun getProgrammingLanguage(): CodeWhispererProgrammingLanguage = programmingLanguage

    fun getSelectedFile(): VirtualFile? = selectedFile

    fun createPayload(): Payload {
        // Fail fast if the selected file is null for File Scan
        if (scope == CodeAnalysisScope.FILE && selectedFile == null) {
            noFileOpenError()
        }

        // Fail fast if the selected file size is greater than the payload limit.
        if (selectedFile != null && selectedFile.length > getPayloadLimitInBytes()) {
            fileTooLarge()
        }

        val start = Instant.now().toEpochMilli()

        LOG.debug { "Creating payload. File selected as root for the context truncation: ${projectRoot.path}" }

        val payloadMetadata = when (selectedFile) {
            null -> getProjectPayloadMetadata()
            else -> when (scope) {
                CodeAnalysisScope.PROJECT -> getProjectPayloadMetadata()
                CodeAnalysisScope.FILE -> if (selectedFile.path.startsWith(projectRoot.path)) {
                    getFilePayloadMetadata(selectedFile)
                } else {
                    projectRoot = selectedFile.parent
                    getFilePayloadMetadata(selectedFile)
                }
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

    fun getFilePayloadMetadata(file: VirtualFile): PayloadMetadata =
        PayloadMetadata(
            setOf(file.path),
            file.length,
            Files.lines(file.toNioPath()).count().toLong(),
            file.programmingLanguage().toTelemetryType()
        )

    /**
     * Timeout for creating the payload [createPayload]
     */
    fun createPayloadTimeoutInSeconds(): Long = CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS

    private fun countLinesInVirtualFile(virtualFile: VirtualFile): Int {
        val bufferedReader = virtualFile.inputStream.bufferedReader()
        return bufferedReader.useLines { lines -> lines.count() }
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
        val traversedDirectories = mutableSetOf<VirtualFile>()
        val stack = Stack<VirtualFile>()
        var currentTotalFileSize = 0L
        var currentTotalLines = 0L
        val languageCounts = mutableMapOf<CodeWhispererProgrammingLanguage, Int>()

        moduleLoop@ for (module in project.modules) {
            val changeListManager = ChangeListManager.getInstance(module.project)
            if (module.guessModuleDir() != null) {
                stack.push(module.guessModuleDir())
                while (stack.isNotEmpty()) {
                    val current = stack.pop()

                    if (!current.isDirectory) {
                        if (!changeListManager.isIgnoredFile(current) && !files.contains(current.path)
                        ) {
                            if (willExceedPayloadLimit(currentTotalFileSize, current.length)) {
                                fileTooLarge()
                            } else {
                                val language = current.programmingLanguage()
                                if (language != CodeWhispererPlainText.INSTANCE && language != CodeWhispererUnknownLanguage.INSTANCE) {
                                    languageCounts[language] = (languageCounts[language] ?: 0) + 1
                                }

                                files.add(current.path)
                                currentTotalFileSize += current.length
                                currentTotalLines += countLinesInVirtualFile(current)
                            }
                        }
                    } else {
                        // Directory case: only traverse if not ignored
                        if (!changeListManager.isIgnoredFile(current) && !traversedDirectories.contains(current)
                        ) {
                            for (child in current.children) {
                                stack.push(child)
                            }
                        }
                        traversedDirectories.add(current)
                    }
                }
            }
        }

        val maxCount = languageCounts.maxByOrNull { it.value }?.value ?: 0
        val maxCountLanguage = languageCounts.filter { it.value == maxCount }.keys.firstOrNull()

        if (maxCountLanguage == null) {
            programmingLanguage = CodeWhispererUnknownLanguage.INSTANCE
            noSupportedFilesError()
        }
        programmingLanguage = maxCountLanguage
        return PayloadMetadata(files, currentTotalFileSize, currentTotalLines, maxCountLanguage.toTelemetryType())
    }

    fun getPath(root: String, relativePath: String = ""): Path? = try {
        Path.of(root, relativePath).normalize()
    } catch (e: Exception) {
        LOG.debug { "Cannot find file at path $relativePath relative to the root $root" }
        null
    }

    fun File.toVirtualFile() = LocalFileSystem.getInstance().findFileByIoFile(this)

    companion object {
        private val LOG = getLogger<CodeScanSessionConfig>()
        fun create(file: VirtualFile?, project: Project, scope: CodeAnalysisScope): CodeScanSessionConfig = CodeScanSessionConfig(file, project, scope)
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
