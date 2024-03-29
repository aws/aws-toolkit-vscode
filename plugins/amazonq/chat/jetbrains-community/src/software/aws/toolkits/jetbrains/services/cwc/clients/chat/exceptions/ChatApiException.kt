// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.clients.chat.exceptions

import software.aws.toolkits.jetbrains.services.cwc.exceptions.ChatException

/**
 * Exceptions thrown by the Chat API
 */
open class ChatApiException(
    message: String,
    val sessionId: String?,
    val requestId: String? = null,
    val statusCode: Int? = null,
    cause: Throwable? = null,
) : ChatException(message, cause)
