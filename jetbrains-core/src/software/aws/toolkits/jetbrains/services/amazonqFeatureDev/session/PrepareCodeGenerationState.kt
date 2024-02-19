// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.createUploadUrl
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference
import software.aws.toolkits.resources.message

class PrepareCodeGenerationState(
    override var tabID: String,
    override var approach: String,
    private var config: SessionStateConfig,
    var filePaths: Array<NewFileZipInfo>,
    var deletedFiles: Array<DeletedFileZipInfo>,
    var references: Array<CodeReference>,
    private var currentIteration: Int,
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

        val nextState = CodeGenerationState(
            tabID = this.tabID,
            approach = "", // No approach needed,
            config = this.config,
            uploadId = uploadUrlResponse.uploadId(),
            filePaths = this.filePaths,
            deletedFiles = this.deletedFiles,
            references = this.references,
            currentIteration = this.currentIteration,
            messenger = messenger
        )

        return nextState.interact(action)
    }
}
