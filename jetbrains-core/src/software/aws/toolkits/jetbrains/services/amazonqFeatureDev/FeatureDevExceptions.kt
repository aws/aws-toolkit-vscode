// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev

import software.aws.toolkits.resources.message

open class FeatureDevException(override val message: String?) : RuntimeException()

internal fun uploadCodeError(): Nothing =
    throw FeatureDevException(message("amazonqFeatureDev.exception.uploadCode"))

internal fun userMessageNotFound(): Nothing =
    throw FeatureDevException(message("amazonqFeatureDev.exception.message_not_found"))

internal fun conversationIdNotFound(): Nothing =
    throw FeatureDevException(message("amazonqFeatureDev.exception.conversation_not_found"))
