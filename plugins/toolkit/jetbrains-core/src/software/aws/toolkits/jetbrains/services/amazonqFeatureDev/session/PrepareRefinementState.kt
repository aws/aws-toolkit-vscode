// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.createUploadUrl
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3
import software.aws.toolkits.telemetry.AmazonqTelemetry
import software.aws.toolkits.telemetry.AmazonqUploadIntent

class PrepareRefinementState(override var approach: String, override var tabID: String, var config: SessionStateConfig) : SessionState {
    override val phase = SessionStatePhase.APPROACH

    override suspend fun interact(action: SessionStateAction): SessionStateInteraction {
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

        val nextState = RefinementState(approach, tabID, config, uploadUrlResponse.uploadId(), 0)
        return nextState.interact(action)
    }
}
