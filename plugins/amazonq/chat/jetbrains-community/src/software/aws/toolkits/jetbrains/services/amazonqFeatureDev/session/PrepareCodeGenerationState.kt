// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.createUploadUrl
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.deleteUploadArtifact
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AmazonqTelemetry
import software.aws.toolkits.telemetry.AmazonqUploadIntent

class PrepareCodeGenerationState(
    override var tabID: String,
    override var approach: String,
    private var config: SessionStateConfig,
    val filePaths: List<NewFileZipInfo>,
    val deletedFiles: List<DeletedFileInfo>,
    val references: List<CodeReferenceGenerated>,
    var uploadId: String,
    private val currentIteration: Int,
    private var messenger: MessagePublisher
) : SessionState {
    override val phase = SessionStatePhase.CODEGEN
    override suspend fun interact(action: SessionStateAction): SessionStateInteraction {
        messenger.sendAnswerPart(tabId = this.tabID, message = message("amazonqFeatureDev.chat_message.uploading_code"))

        val repoZipResult = config.repoContext.getProjectZip()
        val zipFileChecksum = repoZipResult.checksum
        val zipFileLength = repoZipResult.contentLength
        val fileToUpload = repoZipResult.payload

        val uploadUrlResponse = createUploadUrl(
            config.proxyClient,
            config.conversationId,
            zipFileChecksum,
            zipFileLength
        )

        uploadArtifactToS3(uploadUrlResponse.uploadUrl(), fileToUpload, zipFileChecksum, zipFileLength, uploadUrlResponse.kmsKeyArn())

        AmazonqTelemetry.createUpload(
            amazonqConversationId = config.conversationId,
            amazonqRepositorySize = zipFileLength.toDouble(),
            amazonqUploadIntent = AmazonqUploadIntent.TASKASSISTPLANNING
        )

        this.uploadId = uploadUrlResponse.uploadId()

        val nextState = CodeGenerationState(
            tabID = this.tabID,
            approach = "", // No approach needed,
            config = this.config,
            uploadId = this.uploadId,
            currentIteration = this.currentIteration,
            repositorySize = zipFileLength.toDouble(),
            messenger = messenger
        )
        deleteUploadArtifact(fileToUpload)

        return nextState.interact(action)
    }
}
