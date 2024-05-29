// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.client

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.io.HttpRequests
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ContentChecksumType
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationPlanRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationPlanResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ResumeTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.ResumeTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StopTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StopTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationType
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationUploadArtifactType
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationUploadContext
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationUserActionStatus
import software.amazon.awssdk.services.codewhispererruntime.model.UploadContext
import software.amazon.awssdk.services.codewhispererruntime.model.UploadIntent
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportContext
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportIntent
import software.amazon.awssdk.services.codewhispererstreaming.model.TransformationExportContext
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.services.amazonq.APPLICATION_ZIP
import software.aws.toolkits.jetbrains.services.amazonq.AWS_KMS
import software.aws.toolkits.jetbrains.services.amazonq.CONTENT_SHA256
import software.aws.toolkits.jetbrains.services.amazonq.SERVER_SIDE_ENCRYPTION
import software.aws.toolkits.jetbrains.services.amazonq.SERVER_SIDE_ENCRYPTION_AWS_KMS_KEY_ID
import software.aws.toolkits.jetbrains.services.amazonq.clients.AmazonQStreamingClient
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeTransformTelemetryManager
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.telemetry.CodeTransformApiNames
import java.io.File
import java.net.HttpURLConnection
import java.time.Instant

@Service(Service.Level.PROJECT)
class GumbyClient(private val project: Project) {
    private val telemetry = CodeTransformTelemetryManager.getInstance(project)
    private fun connection() = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance())
        ?: error("Attempted to use connection while one does not exist")

    private fun bearerClient() = connection().getConnectionSettings().awsClient<CodeWhispererRuntimeClient>()

    private val amazonQStreamingClient
        get() = AmazonQStreamingClient.getInstance(project)

    fun createGumbyUploadUrl(sha256Checksum: String): CreateUploadUrlResponse {
        val request = CreateUploadUrlRequest.builder()
            .contentChecksumType(ContentChecksumType.SHA_256)
            .contentChecksum(sha256Checksum)
            .uploadIntent(UploadIntent.TRANSFORMATION)
            .build()
        return callApi({ bearerClient().createUploadUrl(request) }, apiName = CodeTransformApiNames.CreateUploadUrl)
    }

    fun createHilUploadUrl(sha256Checksum: String, jobId: JobId): CreateUploadUrlResponse {
        val request = CreateUploadUrlRequest.builder()
            .contentChecksumType(ContentChecksumType.SHA_256)
            .contentChecksum(sha256Checksum)
            .uploadIntent(UploadIntent.TRANSFORMATION)
            .uploadContext(
                UploadContext
                    .builder()
                    .transformationUploadContext(
                        TransformationUploadContext
                            .builder()
                            .uploadArtifactType(TransformationUploadArtifactType.DEPENDENCIES)
                            .jobId(jobId.id)
                            .build()
                    )
                    .build()
            )
            .build()
        return callApi({ bearerClient().createUploadUrl(request) }, apiName = CodeTransformApiNames.CreateUploadUrl)
    }

    fun getCodeModernizationJob(jobId: String): GetTransformationResponse {
        val request = GetTransformationRequest.builder().transformationJobId(jobId).build()
        return callApi({ bearerClient().getTransformation(request) }, apiName = CodeTransformApiNames.GetTransformation, jobId = jobId)
    }

    fun startCodeModernization(
        uploadId: String,
        sourceLanguage: TransformationLanguage,
        targetLanguage: TransformationLanguage
    ): StartTransformationResponse {
        val request = StartTransformationRequest.builder()
            .workspaceState { state ->
                state.programmingLanguage { it.languageName("java") }
                    .uploadId(uploadId)
            }
            .transformationSpec { spec ->
                spec.transformationType(TransformationType.LANGUAGE_UPGRADE)
                    .source { it.language(sourceLanguage) }
                    .target { it.language(targetLanguage) }
            }
            .build()
        return callApi({ bearerClient().startTransformation(request) }, apiName = CodeTransformApiNames.StartTransformation, uploadId = uploadId)
    }

    fun resumeCodeTransformation(
        jobId: JobId,
        userActionStatus: TransformationUserActionStatus
    ): ResumeTransformationResponse {
        val request = ResumeTransformationRequest.builder()
            .transformationJobId(jobId.id)
            .userActionStatus(userActionStatus)
            .build()
        return callApi({ bearerClient().resumeTransformation(request) }, apiName = CodeTransformApiNames.ResumeTransformation, jobId = jobId.id)
    }

    fun getCodeModernizationPlan(jobId: JobId): GetTransformationPlanResponse {
        val request = GetTransformationPlanRequest.builder().transformationJobId(jobId.id).build()
        return callApi({ bearerClient().getTransformationPlan(request) }, apiName = CodeTransformApiNames.GetTransformationPlan, jobId = jobId.id)
    }

    fun stopTransformation(transformationJobId: String): StopTransformationResponse {
        val request = StopTransformationRequest.builder().transformationJobId(transformationJobId).build()
        return callApi({ bearerClient().stopTransformation(request) }, apiName = CodeTransformApiNames.StopTransformation, jobId = transformationJobId)
    }

    private fun <T : CodeWhispererRuntimeResponse> callApi(
        apiCall: () -> T,
        apiName: CodeTransformApiNames,
        jobId: String? = null,
        uploadId: String? = null,
    ): T {
        val startTime = Instant.now()
        var result: CodeWhispererRuntimeResponse? = null
        try {
            result = apiCall()
            return result
        } catch (e: Exception) {
            LOG.error(e) { "$apiName failed: ${e.message}" }
            telemetry.apiError(e.message.toString(), apiName, jobId)
            throw e // pass along error to callee
        } finally {
            telemetry.logApiLatency(
                apiName,
                startTime,
                codeTransformUploadId = uploadId,
                codeTransformJobId = jobId,
                codeTransformRequestId = result?.responseMetadata()?.requestId(),
            )
        }
    }

    suspend fun downloadExportResultArchive(
        jobId: JobId,
        hilDownloadArtifactId: String? = null
    ): MutableList<ByteArray> = amazonQStreamingClient.exportResultArchive(
        jobId.id,
        ExportIntent.TRANSFORMATION,
        if (hilDownloadArtifactId == null) {
            null
        } else {
            ExportContext
                .builder()
                .transformationExportContext(
                    TransformationExportContext
                        .builder()
                        .downloadArtifactId(hilDownloadArtifactId)
                        .downloadArtifactType("ClientInstructions")
                        .build()
                )
                .build()
        },
        { e ->
            LOG.error(e) { "${CodeTransformApiNames.ExportResultArchive} failed: ${e.message}" }
            telemetry.apiError(e.localizedMessage, CodeTransformApiNames.ExportResultArchive, jobId.id)
        },
        { startTime ->
            telemetry.logApiLatency(CodeTransformApiNames.ExportResultArchive, startTime, codeTransformJobId = jobId.id)
        }
    )

    /*
     * Adapted from [CodeWhispererCodeScanSession]
     */
    fun uploadArtifactToS3(url: String, fileToUpload: File, checksum: String, kmsArn: String, shouldStop: () -> Boolean) {
        HttpRequests.put(url, APPLICATION_ZIP).userAgent(AwsClientManager.getUserAgent()).tuner {
            it.setRequestProperty(CONTENT_SHA256, checksum)
            if (kmsArn.isNotEmpty()) {
                it.setRequestProperty(SERVER_SIDE_ENCRYPTION, AWS_KMS)
                it.setRequestProperty(SERVER_SIDE_ENCRYPTION_AWS_KMS_KEY_ID, kmsArn)
            }
        }
            .connect { request -> // default connect timeout is 10s
                val connection = request.connection as HttpURLConnection
                connection.setFixedLengthStreamingMode(fileToUpload.length())
                connection.readTimeout = 32 * 60 * 1000 // pre-signed URL expires in 30 minutes. Includes some buffer for connection.
                fileToUpload.inputStream().use { inputStream ->
                    connection.outputStream.use {
                        val bufferSize = 4096
                        val array = ByteArray(bufferSize)
                        var n = inputStream.readNBytes(array, 0, bufferSize)
                        while (0 != n) {
                            if (shouldStop()) break
                            it.write(array, 0, n)
                            n = inputStream.readNBytes(array, 0, bufferSize)
                        }
                    }
                }
            }
    }

    companion object {
        private val LOG = getLogger<GumbyClient>()

        fun getInstance(project: Project) = project.service<GumbyClient>()
    }
}
