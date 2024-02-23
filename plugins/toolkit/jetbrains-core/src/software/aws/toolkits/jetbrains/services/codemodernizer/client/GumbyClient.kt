// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.client

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import kotlinx.coroutines.future.await
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ContentChecksumType
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationPlanRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationPlanResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StopTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StopTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationType
import software.amazon.awssdk.services.codewhispererruntime.model.UploadIntent
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClient
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportIntent
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportResultArchiveResponseHandler
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.services.codemodernizer.calculateTotalLatency
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeTransformTelemetryState
import software.aws.toolkits.telemetry.CodeTransformApiNames
import software.aws.toolkits.telemetry.CodetransformTelemetry
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

@Service(Service.Level.PROJECT)
class GumbyClient(private val project: Project) {
    private fun connection() = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance())
        ?: error("Attempted to use connection while one does not exist")

    private fun bearerClient() = connection().getConnectionSettings().awsClient<CodeWhispererRuntimeClient>()
    private fun streamingBearerClient() = connection().getConnectionSettings().awsClient<CodeWhispererStreamingAsyncClient>()

    fun createGumbyUploadUrl(sha256Checksum: String): CreateUploadUrlResponse {
        val request = CreateUploadUrlRequest.builder()
            .contentChecksumType(ContentChecksumType.SHA_256)
            .contentChecksum(sha256Checksum)
            .uploadIntent(UploadIntent.TRANSFORMATION)
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
            CodetransformTelemetry.logApiError(
                codeTransformApiErrorMessage = e.message.toString(),
                codeTransformApiNames = apiName,
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformJobId = jobId,
            )
            throw e // pass along error to callee
        } finally {
            CodetransformTelemetry.logApiLatency(
                codeTransformApiNames = apiName,
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformRunTimeLatency = calculateTotalLatency(startTime, Instant.now()),
                codeTransformUploadId = uploadId,
                codeTransformJobId = jobId,
                codeTransformRequestId = result?.responseMetadata()?.requestId(),
            )
        }
    }

    suspend fun downloadExportResultArchive(jobId: JobId): MutableList<ByteArray> {
        val startTime = Instant.now()
        val byteBufferList = mutableListOf<ByteArray>()
        val checksum = AtomicReference("")
        try {
            val result = streamingBearerClient().exportResultArchive(
                {
                    it.exportId(jobId.id)
                    it.exportIntent(ExportIntent.TRANSFORMATION)
                },
                ExportResultArchiveResponseHandler.builder().subscriber(
                    ExportResultArchiveResponseHandler.Visitor.builder()
                        .onBinaryMetadataEvent {
                            checksum.set(it.contentChecksum())
                        }.onBinaryPayloadEvent {
                            val payloadBytes = it.bytes().asByteArray()
                            byteBufferList.add(payloadBytes)
                        }.onDefault {
                            LOG.warn { "Received unknown payload stream: $it" }
                        }
                        .build()
                )
                    .build()
            )
            result.await()
            return byteBufferList
        } catch (e: Exception) {
            LOG.error(e) { "${CodeTransformApiNames.ExportResultArchive} failed: ${e.message}" }
            CodetransformTelemetry.logApiError(
                codeTransformApiNames = CodeTransformApiNames.ExportResultArchive,
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformApiErrorMessage = e.message.toString(),
                codeTransformJobId = jobId.id,
            )
            throw e // pass along error to callee
        } finally {
            CodetransformTelemetry.logApiLatency(
                codeTransformApiNames = CodeTransformApiNames.ExportResultArchive,
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformRunTimeLatency = calculateTotalLatency(startTime, Instant.now()),
                codeTransformJobId = jobId.id,
            )
        }
    }

    companion object {
        private val LOG = getLogger<GumbyClient>()

        fun getInstance(project: Project) = project.service<GumbyClient>()
    }
}
