// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTaskAssistCodeGenerationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartTaskAssistCodeGenerationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ValidationException
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.ContentLengthError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.apiError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.exportParseError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.CodeGenerationStreamResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.ExportTaskAssistResultArchiveStreamResult
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AmazonqTelemetry

private val logger = getLogger<FeatureDevClient>()

fun createConversation(proxyClient: FeatureDevClient): String {
    try {
        logger.debug { "Executing createTaskAssistConversation" }
        val taskAssistConversationResult = proxyClient.createTaskAssistConversation()
        val conversationId = taskAssistConversationResult.conversationId()
        logger.debug {
            "$FEATURE_NAME: Created conversation: {conversationId: $conversationId, requestId: ${taskAssistConversationResult.responseMetadata().requestId()}"
        }

        AmazonqTelemetry.startConversationInvoke(amazonqConversationId = conversationId)

        return conversationId
    } catch (e: Exception) {
        logger.error(e) { "$FEATURE_NAME: Failed to start conversation: ${e.message}" }
        apiError(e.message, e.cause)
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
        logger.debug {
            "$FEATURE_NAME: Created upload url: {uploadId: ${uploadUrlResponse.uploadId()}, requestId: ${uploadUrlResponse.responseMetadata().requestId()}}"
        }
        return uploadUrlResponse
    } catch (e: Exception) {
        logger.error(e) { "$FEATURE_NAME: Failed to generate presigned url: ${e.message}" }
        if (e is ValidationException && e.message?.contains("Invalid contentLength") == true) {
            throw ContentLengthError(message("amazonqFeatureDev.content_length.error_text"), e.cause)
        }
        apiError(e.message, e.cause)
    }
}

suspend fun generatePlan(proxyClient: FeatureDevClient, conversationId: String, uploadId: String, message: String, currentIteration: Int): String {
    try {
        val startTime = System.currentTimeMillis()
        logger.debug { "Executing generateTaskAssistPlan with conversationId $conversationId" }
        val generatePlanResponse = proxyClient.generateTaskAssistPlan(
            conversationId,
            uploadId,
            message
        )
        AmazonqTelemetry.approachInvoke(
            amazonqConversationId = conversationId,
            amazonqGenerateApproachIteration = currentIteration.toDouble(),
            amazonqGenerateApproachLatency = (System.currentTimeMillis() - startTime).toDouble()

        )

        logger.debug { "$FEATURE_NAME: Generated plan: $generatePlanResponse" }
        return generatePlanResponse
    } catch (e: Exception) {
        logger.error(e) { "$FEATURE_NAME: Failed to execute planning : ${e.message}" }
        apiError(e.message, e.cause)
    }
}

fun startTaskAssistCodeGeneration(proxyClient: FeatureDevClient, conversationId: String, uploadId: String, message: String):
    StartTaskAssistCodeGenerationResponse {
    try {
        logger.debug { "Executing startTaskAssistCodeGeneration with conversationId: $conversationId , uploadId: $uploadId" }
        val startCodeGenerationResponse = proxyClient.startTaskAssistCodeGeneration(
            conversationId,
            uploadId,
            message
        )

        logger.debug { "$FEATURE_NAME: Started code generation" }
        return startCodeGenerationResponse
    } catch (e: Exception) {
        logger.error(e) { "$FEATURE_NAME: Failed to execute startTaskAssistCodeGeneration ${e.message}" }
        apiError(e.message, e.cause)
    }
}

fun getTaskAssistCodeGeneration(proxyClient: FeatureDevClient, conversationId: String, codeGenerationId: String):
    GetTaskAssistCodeGenerationResponse {
    try {
        logger.debug { "Executing GetTaskAssistCodeGeneration with conversationId: $conversationId , codeGenerationId: $codeGenerationId" }
        val getCodeGenerationResponse = proxyClient.getTaskAssistCodeGeneration(conversationId, codeGenerationId)

        logger.debug { "$FEATURE_NAME: Received code generation status $getCodeGenerationResponse" }
        return getCodeGenerationResponse
    } catch (e: Exception) {
        logger.error(e) { "$FEATURE_NAME: Failed to execute GetTaskAssistCodeGeneration ${e.message}" }
        apiError(e.message, e.cause)
    }
}

suspend fun exportTaskAssistArchiveResult(proxyClient: FeatureDevClient, conversationId: String): CodeGenerationStreamResult {
    val exportResponse: MutableList<ByteArray>
    try {
        exportResponse = proxyClient.exportTaskAssistResultArchive(conversationId)
        logger.debug { "$FEATURE_NAME: Received export task assist result archive response" }
    } catch (e: Exception) {
        logger.error(e) { "$FEATURE_NAME: Failed to export archive result: ${e.message}" }
        apiError(e.message, e.cause)
    }

    val parsedResult: ExportTaskAssistResultArchiveStreamResult
    try {
        val result = exportResponse.reduce { acc, next -> acc + next } // To map the result it is needed to combine the  full byte array
        parsedResult = jacksonObjectMapper().readValue(result)
    } catch (e: Exception) {
        exportParseError()
    }

    return parsedResult.code_generation_result
}
