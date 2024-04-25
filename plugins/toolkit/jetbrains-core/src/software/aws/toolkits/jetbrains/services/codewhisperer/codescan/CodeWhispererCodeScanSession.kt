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
import kotlinx.coroutines.time.withTimeout
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
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.utils.IoUtils
import software.aws.toolkits.core.utils.Waiters.waitUntil
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.PayloadContext
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CodeScanResponseContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CodeScanServiceInvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODE_SCAN_POLLING_INTERVAL_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_BYTES_IN_KB
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_MILLIS_IN_SECOND
import software.aws.toolkits.jetbrains.utils.assertIsNonDispatchThread
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
                runReadAction { sessionContext.sessionConfig.createPayload() }
            }

            LOG.debug {
                "Total size of source payload in KB: ${payloadContext.srcPayloadSize * 1.0 / TOTAL_BYTES_IN_KB} \n" +
                    "Total size of build payload in KB: ${(payloadContext.buildPayloadSize ?: 0) * 1.0 / TOTAL_BYTES_IN_KB} \n" +
                    "Total size of source zip file in KB: ${payloadContext.srcZipFileSize * 1.0 / TOTAL_BYTES_IN_KB} \n" +
                    "Total number of lines scanned: ${payloadContext.totalLines} \n" +
                    "Total number of files included in payload: ${payloadContext.totalFiles} \n" +
                    "Total time taken for creating payload: ${payloadContext.totalTimeInMilliseconds * 1.0 / TOTAL_MILLIS_IN_SECOND} seconds\n" +
                    "Payload context language: ${payloadContext.language}"
            }
            codeScanResponseContext = codeScanResponseContext.copy(payloadContext = payloadContext)

            // 2 & 3. CreateUploadURL and upload the context.
            currentCoroutineContext.ensureActive()
            LOG.debug { "Uploading source zip located at ${sourceZip.path} to s3" }
            val artifactsUploadStartTime = now()
            val sourceZipUploadResponse = createUploadUrlAndUpload(sourceZip, "SourceCode")
            LOG.debug {
                "Successfully uploaded source zip to s3: " +
                    "Upload id: ${sourceZipUploadResponse.uploadId()} " +
                    "Request id: ${sourceZipUploadResponse.responseMetadata().requestId()}"
            }
            urlResponse[ArtifactType.SOURCE_CODE] = sourceZipUploadResponse
            currentCoroutineContext.ensureActive()
            val artifactsUploadDuration = now() - artifactsUploadStartTime
            codeScanResponseContext = codeScanResponseContext.copy(
                serviceInvocationContext = codeScanResponseContext.serviceInvocationContext.copy(artifactsUploadDuration = artifactsUploadDuration)
            )

            // 4. Call createCodeScan to start a code scan
            currentCoroutineContext.ensureActive()
            LOG.debug { "Requesting security scan for the uploaded artifacts, language: ${payloadContext.language}" }
            val serviceInvocationStartTime = now()
            val createCodeScanResponse = createCodeScan(payloadContext.language.toString())
            LOG.debug {
                "Successfully created security scan with " +
                    "status: ${createCodeScanResponse.status()} " +
                    "for request id: ${createCodeScanResponse.responseMetadata().requestId()}"
            }
            var codeScanStatus = createCodeScanResponse.status()
            if (codeScanStatus == CodeScanStatus.FAILED) {
                LOG.debug {
                    "CodeWhisperer service error occurred. Something went wrong when creating a security scan: $createCodeScanResponse " +
                        "Status: ${createCodeScanResponse.status()} for request id: ${createCodeScanResponse.responseMetadata().requestId()}"
                }
                codeScanFailed()
            }
            val jobId = createCodeScanResponse.jobId()
            codeScanResponseContext = codeScanResponseContext.copy(codeScanJobId = jobId)

            // 5. Keep polling the API GetCodeScan to wait for results for a given timeout period.
            waitUntil(
                succeedOn = { codeScanStatus == CodeScanStatus.COMPLETED },
                maxDuration = Duration.ofSeconds(sessionContext.sessionConfig.overallJobTimeoutInSeconds())
            ) {
                currentCoroutineContext.ensureActive()
                val elapsedTime = (now() - startTime) * 1.0 / TOTAL_MILLIS_IN_SECOND
                LOG.debug { "Waiting for security scan to complete. Elapsed time: $elapsedTime sec." }
                val getCodeScanResponse = getCodeScan(jobId)
                codeScanStatus = getCodeScanResponse.status()
                LOG.debug {
                    "Get security scan status: ${getCodeScanResponse.status()}, " +
                        "request id: ${getCodeScanResponse.responseMetadata().requestId()}"
                }
                sleepThread()
                if (codeScanStatus == CodeScanStatus.FAILED) {
                    LOG.debug {
                        "CodeWhisperer service error occurred. Something went wrong fetching results for security scan: $getCodeScanResponse " +
                            "Status: ${getCodeScanResponse.status()} for request id: ${getCodeScanResponse.responseMetadata().requestId()}"
                    }
                    codeScanFailed()
                }
            }

            LOG.debug { "Security scan completed successfully by CodeWhisperer." }

            // 6. Return the results from the ListCodeScan API.
            currentCoroutineContext.ensureActive()
            LOG.debug { "Fetching results for the completed security scan" }
            var listCodeScanFindingsResponse = listCodeScanFindings(jobId)
            LOG.debug {
                "Successfully fetched results for security scan with " +
                    "request id: ${listCodeScanFindingsResponse.responseMetadata().requestId()}"
            }
            val serviceInvocationDuration = now() - serviceInvocationStartTime
            codeScanResponseContext = codeScanResponseContext.copy(
                serviceInvocationContext = codeScanResponseContext.serviceInvocationContext.copy(serviceInvocationDuration = serviceInvocationDuration)
            )

            val documents = mutableListOf<String>()
            documents.add(listCodeScanFindingsResponse.codeScanFindings())
            while (listCodeScanFindingsResponse.nextToken() != null) {
                documents.add(listCodeScanFindingsResponse.codeScanFindings())
                listCodeScanFindingsResponse = listCodeScanFindings(jobId)
            }
            LOG.debug { "Successfully fetched results for the security scan." }
            LOG.debug { "Code scan findings: ${listCodeScanFindingsResponse.codeScanFindings()}" }
            LOG.debug { "Rendering response to display security scan results." }
            currentCoroutineContext.ensureActive()
            issues = mapToCodeScanIssues(documents)
            codeScanResponseContext = codeScanResponseContext.copy(codeScanTotalIssues = issues.count())
            codeScanResponseContext = codeScanResponseContext.copy(codeScanIssuesWithFixes = issues.count { it.suggestedFixes.isNotEmpty() })
            codeScanResponseContext = codeScanResponseContext.copy(reason = "Succeeded")
            return CodeScanResponse.Success(issues, codeScanResponseContext)
        } catch (e: Exception) {
            val errorCode = (e as? CodeWhispererException)?.awsErrorDetails()?.errorCode()
            val requestId = if (e is CodeWhispererException) e.requestId() else null
            LOG.error {
                "Failed to run security scan and display results. Caused by: ${e.message}, status code: $errorCode, " +
                    "exception: ${e::class.simpleName}, request ID: $requestId " +
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
    fun createUploadUrlAndUpload(zipFile: File, artifactType: String): CreateUploadUrlResponse = try {
        val fileMd5: String = Base64.getEncoder().encodeToString(DigestUtils.md5(FileInputStream(zipFile)))
        LOG.debug { "Fetching presigned URL for uploading $artifactType." }
        val createUploadUrlResponse = createUploadUrl(fileMd5, artifactType)
        LOG.debug { "Successfully fetched presigned URL for uploading $artifactType." }
        val url = createUploadUrlResponse.uploadUrl()
        LOG.debug { "Uploading $artifactType using the presigned URL." }
        uploadArtifactToS3(url, createUploadUrlResponse.uploadId(), zipFile, fileMd5, createUploadUrlResponse.kmsKeyArn())
        createUploadUrlResponse
    } catch (e: Exception) {
        LOG.error { "Security scan failed. Something went wrong uploading artifacts: ${e.message}" }
        throw e
    }

    fun createUploadUrl(md5Content: String, artifactType: String): CreateUploadUrlResponse = clientAdaptor.createUploadUrl(
        CreateUploadUrlRequest.builder()
            .contentMd5(md5Content)
            .artifactType(artifactType)
            .build()
    )

    @Throws(IOException::class)
    fun uploadArtifactToS3(url: String, uploadId: String, fileToUpload: File, md5: String, kmsArn: String?) {
        val uploadIdJson = """{"uploadId":"$uploadId"}"""
        HttpRequests.put(url, "application/zip").userAgent(AwsClientManager.getUserAgent()).tuner {
            it.setRequestProperty(CONTENT_MD5, md5)
            it.setRequestProperty(SERVER_SIDE_ENCRYPTION, AWS_KMS)
            it.setRequestProperty(CONTENT_TYPE, APPLICATION_ZIP)
            if (kmsArn?.isNotEmpty() == true) {
                it.setRequestProperty(SERVER_SIDE_ENCRYPTION_AWS_KMS_KEY_ID, kmsArn)
            }
            it.setRequestProperty(SERVER_SIDE_ENCRYPTION_CONTEXT, Base64.getEncoder().encodeToString(uploadIdJson.toByteArray()))
        }.connect {
            val connection = it.connection as HttpURLConnection
            connection.setFixedLengthStreamingMode(fileToUpload.length())
            IoUtils.copy(fileToUpload.inputStream(), connection.outputStream)
        }
    }

    fun createCodeScan(language: String): CreateCodeScanResponse {
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

    fun listCodeScanFindings(jobId: String): ListCodeScanFindingsResponse = try {
        clientAdaptor.listCodeScanFindings(
            ListCodeScanFindingsRequest.builder()
                .jobId(jobId)
                .codeScanFindingsSchema(CodeScanFindingsSchema.CODESCAN_FINDINGS_1_0)
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
        LOG.debug { "Total code scan issues returned from service: ${scanRecommendations.size}" }
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
    val sessionConfig: CodeScanSessionConfig
)

internal fun defaultPayloadContext() = PayloadContext(CodewhispererLanguage.Unknown, 0, 0, 0, listOf(), 0, 0)

internal fun defaultServiceInvocationContext() = CodeScanServiceInvocationContext(0, 0)

internal fun defaultCodeScanResponseContext() = CodeScanResponseContext(defaultPayloadContext(), defaultServiceInvocationContext())
