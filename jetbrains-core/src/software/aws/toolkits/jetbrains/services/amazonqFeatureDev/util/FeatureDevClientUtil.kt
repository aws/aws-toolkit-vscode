// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util

import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient

private val logger = getLogger<FeatureDevClient>()

fun createConversation(proxyClient: FeatureDevClient): String {
    try {
        logger.debug { "Executing createTaskAssistConversation" }
        val taskAssistConversationResult = proxyClient.createTaskAssistConversation()
        val conversationId = taskAssistConversationResult.conversationId()
        logger.debug {
            "$FEATURE_NAME: Created conversation: {conversationId: $conversationId, requestId: ${taskAssistConversationResult.responseMetadata().requestId()}"
        }
        return conversationId
    } catch (e: Exception) {
        logger.error(e) { "$FEATURE_NAME: Failed to start conversation: ${e.message}" }
        throw e
        // TODO : Specific error handling will be done separately
    }
}

fun createUploadUrl(proxyClient: FeatureDevClient, conversationId: String, contentChecksumSha256: String, contentLength: Long):
    CreateUploadUrlResponse {
    try {
        logger.debug { "Executing createUploadUrl with conversationId $conversationId" }
        val uploadUrlResponse = proxyClient.createTaskAssistUploadUrl(
            conversationId,
            contentChecksumSha256,
            contentLength
        )
        logger.debug { "$FEATURE_NAME: Created upload url:" }
        return uploadUrlResponse
    } catch (e: Exception) {
        logger.error(e) { "$FEATURE_NAME: Failed to generate presigned url: ${e.message}" }
        throw e
        // TODO : Specific error handling will be done separately
    }
}

suspend fun generatePlan(proxyClient: FeatureDevClient, conversationId: String, uploadId: String, message: String): String {
    try {
        logger.debug { "Executing generateTaskAssistPlan with conversationId $conversationId" }
        val generatePlanResponse = proxyClient.generateTaskAssistPlan(
            conversationId,
            uploadId,
            message
        )

        logger.debug { "$FEATURE_NAME: Generated plan" }
        return generatePlanResponse
    } catch (e: Exception) {
        logger.error(e) { "$FEATURE_NAME: Failed to execute planning" }
        throw e
        // TODO : Specific error handling will be done separately
    }
}
