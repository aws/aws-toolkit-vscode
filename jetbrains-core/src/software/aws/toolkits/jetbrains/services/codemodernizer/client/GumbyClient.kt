// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.client

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import kotlinx.coroutines.future.await
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.ContentChecksumType
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationPlanResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StopTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationType
import software.amazon.awssdk.services.codewhispererruntime.model.UploadIntent
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClient
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportIntent
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportResultArchiveRequest
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportResultArchiveResponseHandler
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import java.util.concurrent.atomic.AtomicReference

@Service(Service.Level.PROJECT)
class GumbyClient(private val project: Project) {
    private fun connection() = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance())
        ?: error("Attempted to use connection while one does not exist")

    private fun bearerClient() = connection().getConnectionSettings().awsClient<CodeWhispererRuntimeClient>()
    private fun streamingBearerClient() = connection().getConnectionSettings().awsClient<CodeWhispererStreamingAsyncClient>()

    fun createGumbyUploadUrl(sha256Checksum: String): CreateUploadUrlResponse = bearerClient().createUploadUrl {
        it.contentChecksumType(ContentChecksumType.SHA_256)
            .contentChecksum(sha256Checksum)
            .uploadIntent(UploadIntent.TRANSFORMATION)
    }

    fun getCodeModernizationJob(jobId: String): GetTransformationResponse = bearerClient().getTransformation {
        it.transformationJobId(jobId)
    }

    fun startCodeModernization(
        uploadId: String,
        sourceLanguage: TransformationLanguage,
        targetLanguage: TransformationLanguage
    ): StartTransformationResponse = bearerClient().startTransformation { request ->
        request.workspaceState { state ->
            state.programmingLanguage { it.languageName("java") }
                .uploadId(uploadId)
        }
        request.transformationSpec { spec ->
            spec.transformationType(TransformationType.LANGUAGE_UPGRADE)
                .source { it.language(sourceLanguage) }
                .target { it.language(targetLanguage) }
        }
    }

    fun getCodeModernizationPlan(jobId: JobId): GetTransformationPlanResponse = bearerClient().getTransformationPlan {
        it.transformationJobId(jobId.id)
    }

    fun stopTransformation(transformationId: String): StopTransformationResponse = bearerClient().stopTransformation {
        it.transformationJobId(transformationId)
    }

    suspend fun downloadExportResultArchive(jobId: JobId): MutableList<ByteArray> {
        val byteBufferList = mutableListOf<ByteArray>()
        val checksum = AtomicReference("")
        val result = streamingBearerClient().exportResultArchive(
            ExportResultArchiveRequest.builder()
                .exportId(jobId.id)
                .exportIntent(ExportIntent.TRANSFORMATION)
                .build(),
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
    }

    companion object {
        private val LOG = getLogger<GumbyClient>()

        fun getInstance(project: Project) = project.service<GumbyClient>()
    }
}
