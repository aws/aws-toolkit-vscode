// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev

import software.aws.toolkits.resources.message

open class FeatureDevException(override val message: String?, override val cause: Throwable? = null) : RuntimeException()

class ContentLengthError(override val message: String, override val cause: Throwable?) : RuntimeException()

internal fun codeGenerationFailedError(): Nothing =
    throw FeatureDevException(message("amazonqFeatureDev.code_generation.failed_generation"))

internal fun uploadCodeError(): Nothing =
    throw FeatureDevException(message("amazonqFeatureDev.exception.uploadCode"))

internal fun userMessageNotFound(): Nothing =
    throw FeatureDevException(message("amazonqFeatureDev.exception.message_not_found"))

internal fun conversationIdNotFound(): Nothing =
    throw FeatureDevException(message("amazonqFeatureDev.exception.conversation_not_found"))

internal fun apiError(message: String?, cause: Throwable?): Nothing =
    throw FeatureDevException(message, cause)

internal fun exportParseError(): Nothing =
    throw FeatureDevException(message("amazonqFeatureDev.exception.export_parsing_error"))

val denyListedErrors = arrayOf("Deserialization error", "Inaccessible host")
fun createUserFacingErrorMessage(message: String?): String? =
    if (message != null && denyListedErrors.any { message.contains(it) }) "$FEATURE_NAME API request failed" else message
