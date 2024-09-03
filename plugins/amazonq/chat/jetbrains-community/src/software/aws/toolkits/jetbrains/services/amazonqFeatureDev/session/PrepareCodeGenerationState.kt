// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendUpdatePlaceholder
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.deleteUploadArtifact
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.getStartUrl
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AmazonqTelemetry
import software.aws.toolkits.telemetry.AmazonqUploadIntent
import software.aws.toolkits.telemetry.Result

private val logger = getLogger<PrepareCodeGenerationState>()

class PrepareCodeGenerationState(
    override var tabID: String,
    override var approach: String,
    private var config: SessionStateConfig,
    val filePaths: List<NewFileZipInfo>,
    val deletedFiles: List<DeletedFileInfo>,
    val references: List<CodeReferenceGenerated>,
    var uploadId: String,
    private val currentIteration: Int,
    private var messenger: MessagePublisher,
    var codeGenerationRemainingIterationCount: Int? = null,
    var codeGenerationTotalIterationCount: Int? = null
) : SessionState {
    override val phase = SessionStatePhase.CODEGEN
    override suspend fun interact(action: SessionStateAction): SessionStateInteraction {
        val startTime = System.currentTimeMillis()
        var result: Result = Result.Succeeded
        var failureReason: String? = null
        var failureReasonDesc: String? = null
        var zipFileLength: Long? = null
        val nextState: SessionState
        try {
            messenger.sendAnswerPart(tabId = this.tabID, message = message("amazonqFeatureDev.chat_message.uploading_code"))
            messenger.sendUpdatePlaceholder(tabId = this.tabID, newPlaceholder = message("amazonqFeatureDev.chat_message.uploading_code"))

            val repoZipResult = config.repoContext.getProjectZip()
            val zipFileChecksum = repoZipResult.checksum
            zipFileLength = repoZipResult.contentLength
            val fileToUpload = repoZipResult.payload

            val uploadUrlResponse = config.featureDevService.createUploadUrl(
                config.conversationId,
                zipFileChecksum,
                zipFileLength
            )

            uploadArtifactToS3(uploadUrlResponse.uploadUrl(), fileToUpload, zipFileChecksum, zipFileLength, uploadUrlResponse.kmsKeyArn())
            deleteUploadArtifact(fileToUpload)

            this.uploadId = uploadUrlResponse.uploadId()
            messenger.sendAnswerPart(tabId = this.tabID, message = message("amazonqFeatureDev.placeholder.context_gathering_complete"))
            messenger.sendUpdatePlaceholder(tabId = this.tabID, newPlaceholder = message("amazonqFeatureDev.placeholder.context_gathering_complete"))
            nextState = CodeGenerationState(
                tabID = this.tabID,
                approach = "", // No approach needed,
                config = this.config,
                uploadId = this.uploadId,
                currentIteration = this.currentIteration,
                repositorySize = zipFileLength.toDouble(),
                messenger = messenger
            )
        } catch (e: Exception) {
            result = Result.Failed
            failureReason = e.javaClass.simpleName
            failureReasonDesc = e.message
            logger.warn(e) { "$FEATURE_NAME: Code uploading failed: ${e.message}" }
            throw e
        } finally {
            AmazonqTelemetry.createUpload(
                amazonqConversationId = config.conversationId,
                amazonqRepositorySize = zipFileLength?.toDouble(),
                amazonqUploadIntent = AmazonqUploadIntent.TASKASSISTPLANNING,
                result = result,
                reason = failureReason,
                reasonDesc = failureReasonDesc,
                duration = (System.currentTimeMillis() - startTime).toDouble(),
                credentialStartUrl = getStartUrl(config.featureDevService.project)
            )
        }
        // It is essential to interact with the next state outside of try-catch block for  the telemetry to capture events for the states separately
        return nextState.interact(action)
    }
}
