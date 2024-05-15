// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.util.TimeoutUtil.sleep
import com.intellij.util.io.HttpRequests
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.time.withTimeout
import kotlinx.coroutines.withContext
import org.apache.commons.codec.digest.DigestUtils
import software.amazon.awssdk.services.codewhisperer.model.ArtifactType
import software.amazon.awssdk.services.codewhisperer.model.CodeScanFindingsSchema
import software.amazon.awssdk.services.codewhisperer.model.CodeScanStatus
import software.amazon.awssdk.services.codewhisperer.model.CodeWhispererException
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisUploadContext
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.UploadContext
import software.amazon.awssdk.services.codewhispererruntime.model.UploadIntent
import software.amazon.awssdk.utils.IoUtils
import software.aws.toolkits.core.utils.Waiters.waitUntil
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.PayloadContext
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CodeScanResponseContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CodeScanServiceInvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODE_SCAN_POLLING_INTERVAL_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FILE_SCANS_THROTTLING_MESSAGE
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FILE_SCAN_INITIAL_POLLING_INTERVAL_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.PROJECT_SCANS_THROTTLING_MESSAGE
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.PROJECT_SCAN_INITIAL_POLLING_INTERVAL_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_BYTES_IN_KB
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_MILLIS_IN_SECOND
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.notifyErrorCodeWhispererUsageLimit
import software.aws.toolkits.jetbrains.utils.assertIsNonDispatchThread
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import kotlin.coroutines.coroutineContext
import kotlin.math.max
import kotlin.math.min

class CodeWhispererCodeScanSession(val sessionContext: CodeScanSessionContext) {
    private val clientToken: UUID = UUID.randomUUID()
    private val urlResponse = mutableMapOf<ArtifactType, CreateUploadUrlResponse>()

    private val clientAdaptor = CodeWhispererClientAdaptor.getInstance(sessionContext.project)

    private fun now() = Instant.now().toEpochMilli()

    /**
     * Note that this function makes network calls and needs to be run from a background thread.
     * Runs a code scan session which comprises the following steps:
     *  1. Generate truncation (zip files) based on the truncation in the session context.
     *  2. CreateUploadURL to upload the context.
     *  3. Upload the zip files using the URL
     *  4. Call createCodeScan to start a code scan
     *  5. Keep polling the API GetCodeScan to wait for results for a given timeout period.
     *  6. Return the results from the ListCodeScan API.
     */
    suspend fun run(): CodeScanResponse {
        var issues: List<CodeWhispererCodeScanIssue> = listOf()
        var codeScanResponseContext = defaultCodeScanResponseContext()
        val currentCoroutineContext = coroutineContext
        try {
            assertIsNonDispatchThread()
            currentCoroutineContext.ensureActive()
            val startTime = now()
            val (payloadContext, sourceZip) = withTimeout(Duration.ofSeconds(sessionContext.sessionConfig.createPayloadTimeoutInSeconds())) {
                sessionContext.sessionConfig.createPayload()
            }

            if (isProjectScope()) {
                LOG.debug {
                    "Total size of source payload in KB: ${payloadContext.srcPayloadSize * 1.0 / TOTAL_BYTES_IN_KB} \n" +
                        "Total size of build payload in KB: ${(payloadContext.buildPayloadSize ?: 0) * 1.0 / TOTAL_BYTES_IN_KB} \n" +
                        "Total size of source zip file in KB: ${payloadContext.srcZipFileSize * 1.0 / TOTAL_BYTES_IN_KB} \n" +
                        "Total number of lines scanned: ${payloadContext.totalLines} \n" +
                        "Total number of files included in payload: ${payloadContext.totalFiles} \n" +
                        "Total time taken for creating payload: ${payloadContext.totalTimeInMilliseconds * 1.0 / TOTAL_MILLIS_IN_SECOND} seconds\n" +
                        "Payload context language: ${payloadContext.language}"
                }
            }
            codeScanResponseContext = codeScanResponseContext.copy(payloadContext = payloadContext)

            // 2 & 3. CreateUploadURL and upload the context.
            currentCoroutineContext.ensureActive()
            val artifactsUploadStartTime = now()
            val codeScanName = UUID.randomUUID().toString()
            val sourceZipUploadResponse = createUploadUrlAndUpload(sourceZip, "SourceCode", codeScanName)
            if (isProjectScope()) {
                LOG.debug {
                    "Successfully uploaded source zip to s3: " +
                        "Upload id: ${sourceZipUploadResponse.uploadId()} " +
                        "Request id: ${sourceZipUploadResponse.responseMetadata().requestId()}"
                }
            }
            urlResponse[ArtifactType.SOURCE_CODE] = sourceZipUploadResponse
            currentCoroutineContext.ensureActive()
            val artifactsUploadDuration = now() - artifactsUploadStartTime
            codeScanResponseContext = codeScanResponseContext.copy(
                serviceInvocationContext = codeScanResponseContext.serviceInvocationContext.copy(artifactsUploadDuration = artifactsUploadDuration)
            )

            // 4. Call createCodeScan to start a code scan
            currentCoroutineContext.ensureActive()
            val serviceInvocationStartTime = now()
            val createCodeScanResponse = createCodeScan(payloadContext.language.toString(), codeScanName)
            if (isProjectScope()) {
                LOG.debug {
                    "Successfully created security scan with " +
                        "status: ${createCodeScanResponse.status()} " +
                        "for request id: ${createCodeScanResponse.responseMetadata().requestId()}"
                }
            }
            var codeScanStatus = createCodeScanResponse.status()
            if (codeScanStatus == CodeScanStatus.FAILED) {
                if (isProjectScope()) {
                    LOG.debug {
                        "CodeWhisperer service error occurred. Something went wrong when creating a security scan: $createCodeScanResponse " +
                            "Status: ${createCodeScanResponse.status()} for request id: ${createCodeScanResponse.responseMetadata().requestId()}"
                    }
                }
                val errorMessage = createCodeScanResponse.errorMessage()?.let { it } ?: message("codewhisperer.codescan.run_scan_error_telemetry")
                codeScanFailed(errorMessage)
            }
            val jobId = createCodeScanResponse.jobId()
            codeScanResponseContext = codeScanResponseContext.copy(codeScanJobId = jobId)
            if (isProjectScope()) {
                sleep(PROJECT_SCAN_INITIAL_POLLING_INTERVAL_IN_SECONDS * TOTAL_MILLIS_IN_SECOND)
            } else {
                sleep(FILE_SCAN_INITIAL_POLLING_INTERVAL_IN_SECONDS * TOTAL_MILLIS_IN_SECOND)
            }

            // 5. Keep polling the API GetCodeScan to wait for results for a given timeout period.
            waitUntil(
                succeedOn = { codeScanStatus == CodeScanStatus.COMPLETED },
                maxDuration = Duration.ofSeconds(sessionContext.sessionConfig.overallJobTimeoutInSeconds())
            ) {
                currentCoroutineContext.ensureActive()
                val elapsedTime = (now() - startTime) * 1.0 / TOTAL_MILLIS_IN_SECOND
                if (isProjectScope()) {
                    LOG.debug { "Waiting for security scan to complete. Elapsed time: $elapsedTime sec." }
                }
                val getCodeScanResponse = getCodeScan(jobId)
                codeScanStatus = getCodeScanResponse.status()
                if (isProjectScope()) {
                    LOG.debug {
                        "Get security scan status: ${getCodeScanResponse.status()}, " +
                            "request id: ${getCodeScanResponse.responseMetadata().requestId()}"
                    }
                }
                sleepThread()
                if (codeScanStatus == CodeScanStatus.FAILED) {
                    if (isProjectScope()) {
                        LOG.debug {
                            "CodeWhisperer service error occurred. Something went wrong fetching results for security scan: $getCodeScanResponse " +
                                "Status: ${getCodeScanResponse.status()} for request id: ${getCodeScanResponse.responseMetadata().requestId()}"
                        }
                    }
                    val errorMessage = getCodeScanResponse.errorMessage()?.let { it } ?: message("codewhisperer.codescan.run_scan_error_telemetry")
                    codeScanFailed(errorMessage)
                }
            }

            LOG.debug { "Security scan completed successfully by CodeWhisperer." }

            // 6. Return the results from the ListCodeScan API.
            currentCoroutineContext.ensureActive()
            var listCodeScanFindingsResponse = listCodeScanFindings(jobId, null)
            val serviceInvocationDuration = now() - serviceInvocationStartTime
            codeScanResponseContext = codeScanResponseContext.copy(
                serviceInvocationContext = codeScanResponseContext.serviceInvocationContext.copy(serviceInvocationDuration = serviceInvocationDuration)
            )

            val documents = mutableListOf<String>()
            documents.add(listCodeScanFindingsResponse.codeScanFindings())
            // coroutineContext helps to actively cancel the bigger projects quickly
            withContext(currentCoroutineContext) {
                while (listCodeScanFindingsResponse.nextToken() != null && currentCoroutineContext.isActive) {
                    listCodeScanFindingsResponse = listCodeScanFindings(jobId, listCodeScanFindingsResponse.nextToken())
                    documents.add(listCodeScanFindingsResponse.codeScanFindings())
                }
            }

            if (isProjectScope()) {
                LOG.debug { "Rendering response to display security scan results." }
            }
            currentCoroutineContext.ensureActive()
            issues = mapToCodeScanIssues(documents)
            codeScanResponseContext = codeScanResponseContext.copy(codeScanTotalIssues = issues.count())
            codeScanResponseContext = codeScanResponseContext.copy(codeScanIssuesWithFixes = issues.count { it.suggestedFixes.isNotEmpty() })
            codeScanResponseContext = codeScanResponseContext.copy(reason = "Succeeded")
            return CodeScanResponse.Success(issues, codeScanResponseContext)
        } catch (e: Exception) {
            val exception = e as? CodeWhispererException
            val awsError = exception?.awsErrorDetails()

            if (awsError != null) {
                if (awsError.errorCode() == "ThrottlingException" && awsError.errorMessage() != null) {
                    if (awsError.errorMessage()!!.contains(PROJECT_SCANS_THROTTLING_MESSAGE)) {
                        LOG.info { "Project Scans limit reached" }
                        notifyErrorCodeWhispererUsageLimit(sessionContext.project, true)
                    } else if (awsError.errorMessage()!!.contains(FILE_SCANS_THROTTLING_MESSAGE)) {
                        LOG.info { "File Scans limit reached" }
                        CodeWhispererExplorerActionManager.getInstance().setMonthlyQuotaForCodeScansExceeded(true)
                    }
                }
            }
            LOG.error {
                "Failed to run security scan and display results. Caused by: ${e.message}, status code: ${awsError?.errorCode()}, " +
                    "exception: ${e::class.simpleName}, request ID: ${exception?.requestId()}" +
                    "Jetbrains IDE: ${ApplicationInfo.getInstance().fullApplicationName}, " +
                    "IDE version: ${ApplicationInfo.getInstance().apiVersion}, " +
                    "stacktrace: ${e.stackTrace.contentDeepToString()}"
            }
            return CodeScanResponse.Failure(issues, codeScanResponseContext, e)
        }
    }

    /**
     * Creates an upload URL and uplaods the zip file to the presigned URL
     */
    fun createUploadUrlAndUpload(zipFile: File, artifactType: String, codeScanName: String): CreateUploadUrlResponse {
        // Throw error if zipFile is invalid.
        if (!zipFile.exists()) {
            invalidSourceZipError()
        }
        val fileMd5: String = Base64.getEncoder().encodeToString(DigestUtils.md5(FileInputStream(zipFile)))
        val createUploadUrlResponse = createUploadUrl(fileMd5, artifactType, codeScanName)
        val url = createUploadUrlResponse.uploadUrl()
        if (isProjectScope()) {
            LOG.debug { "Uploading $artifactType using the presigned URL." }
        }
        uploadArtifactToS3(
            url,
            createUploadUrlResponse.uploadId(),
            zipFile,
            fileMd5,
            createUploadUrlResponse.kmsKeyArn(),
            createUploadUrlResponse.requestHeaders()
        )
        return createUploadUrlResponse
    }

    fun createUploadUrl(md5Content: String, artifactType: String, codeScanName: String): CreateUploadUrlResponse = try {
        clientAdaptor.createUploadUrl(
            CreateUploadUrlRequest.builder()
                .contentMd5(md5Content)
                .artifactType(artifactType)
                .uploadIntent(getUploadIntent(sessionContext.codeAnalysisScope))
                .uploadContext(UploadContext.fromCodeAnalysisUploadContext(CodeAnalysisUploadContext.builder().codeScanName(codeScanName).build()))
                .build()
        )
    } catch (e: Exception) {
        throw e
    }

    private fun getUploadIntent(scope: CodeWhispererConstants.CodeAnalysisScope): UploadIntent = when (scope) {
        CodeWhispererConstants.CodeAnalysisScope.FILE -> UploadIntent.AUTOMATIC_FILE_SECURITY_SCAN
        CodeWhispererConstants.CodeAnalysisScope.PROJECT -> UploadIntent.FULL_PROJECT_SECURITY_SCAN
    }

    @Throws(IOException::class)
    fun uploadArtifactToS3(url: String, uploadId: String, fileToUpload: File, md5: String, kmsArn: String?, requestHeaders: Map<String, String>?) {
        try {
            val uploadIdJson = """{"uploadId":"$uploadId"}"""
            HttpRequests.put(url, "application/zip").userAgent(AwsClientManager.getUserAgent()).tuner {
                if (requestHeaders.isNullOrEmpty()) {
                    it.setRequestProperty(CONTENT_MD5, md5)
                    it.setRequestProperty(CONTENT_TYPE, APPLICATION_ZIP)
                    it.setRequestProperty(SERVER_SIDE_ENCRYPTION, AWS_KMS)
                    if (kmsArn?.isNotEmpty() == true) {
                        it.setRequestProperty(SERVER_SIDE_ENCRYPTION_AWS_KMS_KEY_ID, kmsArn)
                    }
                    it.setRequestProperty(SERVER_SIDE_ENCRYPTION_CONTEXT, Base64.getEncoder().encodeToString(uploadIdJson.toByteArray()))
                } else {
                    requestHeaders.forEach { entry ->
                        it.setRequestProperty(entry.key, entry.value)
                    }
                }
            }.connect {
                val connection = it.connection as HttpURLConnection
                connection.setFixedLengthStreamingMode(fileToUpload.length())
                IoUtils.copy(fileToUpload.inputStream(), connection.outputStream)
            }
        } catch (e: Exception) {
            val errorMessage = e.message?.let { it } ?: message("codewhisperer.codescan.run_scan_error_telemetry")
            throw uploadArtifactFailedError(errorMessage)
        }
    }

    fun createCodeScan(language: String, codeScanName: String): CreateCodeScanResponse {
        val artifactsMap = mapOf(
            ArtifactType.SOURCE_CODE to urlResponse[ArtifactType.SOURCE_CODE]?.uploadId(),
            ArtifactType.BUILT_JARS to urlResponse[ArtifactType.BUILT_JARS]?.uploadId()
        ).filter { (_, v) -> v != null }

        try {
            return clientAdaptor.createCodeScan(
                CreateCodeScanRequest.builder()
                    .clientToken(clientToken.toString())
                    .programmingLanguage { it.languageName(language) }
                    .artifacts(artifactsMap)
                    .scope(sessionContext.codeAnalysisScope.value)
                    .codeScanName(codeScanName)
                    .build()
            )
        } catch (e: Exception) {
            LOG.debug { "Creating security scan failed: ${e.message}" }
            throw e
        }
    }

    fun getCodeScan(jobId: String): GetCodeScanResponse = try {
        clientAdaptor.getCodeScan(
            GetCodeScanRequest.builder()
                .jobId(jobId)
                .build()
        )
    } catch (e: Exception) {
        LOG.debug { "Getting security scan failed: ${e.message}" }
        throw e
    }

    fun listCodeScanFindings(jobId: String, nextToken: String?): ListCodeScanFindingsResponse = try {
        clientAdaptor.listCodeScanFindings(
            ListCodeScanFindingsRequest.builder()
                .jobId(jobId)
                .codeScanFindingsSchema(CodeScanFindingsSchema.CODESCAN_FINDINGS_1_0)
                .nextToken(nextToken)
                .build()
        )
    } catch (e: Exception) {
        LOG.debug { "Listing security scan failed: ${e.message}" }
        throw e
    }

    fun mapToCodeScanIssues(recommendations: List<String>): List<CodeWhispererCodeScanIssue> {
        val scanRecommendations: List<CodeScanRecommendation> = recommendations.map {
            val value: List<CodeScanRecommendation> = MAPPER.readValue(it)
            value
        }.flatten()
        if (isProjectScope()) {
            LOG.debug { "Total code scan issues returned from service: ${scanRecommendations.size}" }
        }
        return scanRecommendations.mapNotNull {
            val file = try {
                LocalFileSystem.getInstance().findFileByIoFile(
                    Path.of(sessionContext.sessionConfig.projectRoot.path, it.filePath).toFile()
                )
            } catch (e: Exception) {
                LOG.debug { "Cannot find file at location ${it.filePath}" }
                null
            }
            when (file?.isDirectory) {
                false -> {
                    runReadAction {
                        FileDocumentManager.getInstance().getDocument(file)
                    }?.let { document ->
                        val endLineInDocument = min(max(0, it.endLine - 1), document.lineCount - 1)
                        val endCol = document.getLineEndOffset(endLineInDocument) - document.getLineStartOffset(endLineInDocument) + 1
                        CodeWhispererCodeScanIssue(
                            startLine = it.startLine,
                            startCol = 1,
                            endLine = it.endLine,
                            endCol = endCol,
                            file = file,
                            project = sessionContext.project,
                            title = it.title,
                            description = it.description,
                            detectorId = it.detectorId,
                            detectorName = it.detectorName,
                            findingId = it.findingId,
                            ruleId = it.ruleId,
                            relatedVulnerabilities = it.relatedVulnerabilities,
                            severity = it.severity,
                            recommendation = it.remediation.recommendation,
                            suggestedFixes = it.remediation.suggestedFixes
                        )
                    }
                }
                else -> null
            }
        }.onEach { issue ->
            // Add range highlighters for all the issues found.
            runInEdt {
                issue.rangeHighlighter = issue.addRangeHighlighter()
            }
        }
    }

    fun sleepThread() {
        sleep(CODE_SCAN_POLLING_INTERVAL_IN_SECONDS * TOTAL_MILLIS_IN_SECOND)
    }

    private fun isProjectScope(): Boolean = sessionContext.codeAnalysisScope == CodeWhispererConstants.CodeAnalysisScope.PROJECT

    companion object {
        private val LOG = getLogger<CodeWhispererCodeScanSession>()
        private val MAPPER = jacksonObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
        const val AWS_KMS = "aws:kms"
        const val APPLICATION_ZIP = "application/zip"
        const val CONTENT_MD5 = "Content-MD5"
        const val CONTENT_TYPE = "Content-Type"
        const val SERVER_SIDE_ENCRYPTION = "x-amz-server-side-encryption"
        const val SERVER_SIDE_ENCRYPTION_AWS_KMS_KEY_ID = "x-amz-server-side-encryption-aws-kms-key-id"
        const val SERVER_SIDE_ENCRYPTION_CONTEXT = "x-amz-server-side-encryption-context"
    }
}

sealed class CodeScanResponse {
    abstract val issues: List<CodeWhispererCodeScanIssue>
    abstract val responseContext: CodeScanResponseContext

    data class Success(
        override val issues: List<CodeWhispererCodeScanIssue>,
        override val responseContext: CodeScanResponseContext
    ) : CodeScanResponse()

    data class Failure(
        override val issues: List<CodeWhispererCodeScanIssue>,
        override val responseContext: CodeScanResponseContext,
        val failureReason: Throwable
    ) : CodeScanResponse()
}

internal data class CodeScanRecommendation(
    val filePath: String,
    val startLine: Int,
    val endLine: Int,
    val title: String,
    val description: Description,
    val detectorId: String,
    val detectorName: String,
    val findingId: String,
    val ruleId: String?,
    val relatedVulnerabilities: List<String>,
    val severity: String,
    val remediation: Remediation
)

data class Description(val text: String, val markdown: String)

data class Remediation(val recommendation: Recommendation, val suggestedFixes: List<SuggestedFix>)

data class Recommendation(val text: String, val url: String)

data class SuggestedFix(val description: String, val code: String)

data class CodeScanSessionContext(
    val project: Project,
    val sessionConfig: CodeScanSessionConfig,
    val codeAnalysisScope: CodeWhispererConstants.CodeAnalysisScope
)

internal fun defaultPayloadContext() = PayloadContext(CodewhispererLanguage.Unknown, 0, 0, 0, listOf(), 0, 0)

internal fun defaultServiceInvocationContext() = CodeScanServiceInvocationContext(0, 0)

internal fun defaultCodeScanResponseContext() = CodeScanResponseContext(defaultPayloadContext(), defaultServiceInvocationContext())
