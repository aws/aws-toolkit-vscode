// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.fileFormatNotSupported
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_BYTES_IN_KB
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_BYTES_IN_MB
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.File
import java.nio.file.Path

internal sealed class CodeScanSessionConfig {
    abstract fun createPayload(): Payload

    /**
     * Timeout for the overall job - "Run Security Scan".
     */
    abstract fun overallJobTimeoutInSeconds(): Long

    /**
     * Timeout for creating the payload [createPayload]
     */
    open fun createPayloadTimeoutInSeconds(): Long = CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS

    abstract fun getPayloadLimitInBytes(): Int

    open fun getPresentablePayloadLimit(): String = when (getPayloadLimitInBytes() >= TOTAL_BYTES_IN_MB) {
        true -> "${getPayloadLimitInBytes() / TOTAL_BYTES_IN_MB}MB"
        false -> "${getPayloadLimitInBytes() / TOTAL_BYTES_IN_KB}KB"
    }

    protected fun zipFiles(files: List<Path>): File = createTemporaryZipFile {
        files.forEach { file ->
            LOG.debug { "Selected file for truncation: $file" }
            it.putNextEntry(file.toString(), file)
        }
    }.toFile()

    protected fun File.toVirtualFile() = LocalFileSystem.getInstance().findFileByIoFile(this)

    companion object {
        private val LOG = getLogger<CodeScanSessionConfig>()
        fun create(file: VirtualFile, project: Project): CodeScanSessionConfig = when (file.extension) {
            "java" -> JavaCodeScanSessionConfig(file, project)
            "py" -> PythonCodeScanSessionConfig(file, project)
            else -> fileFormatNotSupported(file.extension ?: "")
        }
    }
}

data class Payload(
    val context: PayloadContext,
    val srcZip: File,
    val buildZip: File? = null
)

data class PayloadContext(
    val language: CodewhispererLanguage,
    val totalLines: Long,
    val totalFiles: Int,
    val totalTimeInMilliseconds: Long,
    val srcPayloadSize: Long,
    val srcZipFileSize: Long,
    val buildPayloadSize: Long? = null,
    val buildZipFileSize: Long? = null
)
