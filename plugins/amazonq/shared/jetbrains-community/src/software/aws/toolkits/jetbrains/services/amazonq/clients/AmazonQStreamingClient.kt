// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.clients

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import kotlinx.coroutines.future.await
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClient
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportIntent
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportResultArchiveResponseHandler
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

@Service(Service.Level.PROJECT)
class AmazonQStreamingClient(private val project: Project) {
    private fun connection() = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance())
        ?: error("Attempted to use connection while one does not exist")

    private fun streamingBearerClient() = connection().getConnectionSettings().awsClient<CodeWhispererStreamingAsyncClient>()

    suspend fun exportResultArchive(
        exportId: String,
        exportIntent: ExportIntent,
        /**
         * Handler for streaming exceptions.
         *
         * Useful for cases where some exception handling is needed. e.g. log data or send telemetry.
         *
         * The client will then raise the exception to the callee.
         *
         * @param e exception thrown by the streaming client.
         */
        onError: (e: Exception) -> Unit,
        /**
         * Handler for extra logic after streaming ends.
         *
         * Useful for cases where some exception handling is needed. e.g. log data or send telemetry.
         *
         * @param startTime exception thrown by the streaming client.
         */
        onStreamingFinished: (startTime: Instant) -> Unit
    ): MutableList<ByteArray> {
        val startTime = Instant.now()
        val byteBufferList = mutableListOf<ByteArray>()
        val checksum = AtomicReference("")

        try {
            val result = streamingBearerClient().exportResultArchive(
                {
                    it.exportId(exportId)
                    it.exportIntent(exportIntent)
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
        } catch (e: Exception) {
            onError(e)
            throw e
        } finally {
            onStreamingFinished(startTime)
        }

        return byteBufferList
    }

    companion object {
        private val LOG = getLogger<AmazonQStreamingClient>()

        fun getInstance(project: Project) = project.service<AmazonQStreamingClient>()
    }
}
