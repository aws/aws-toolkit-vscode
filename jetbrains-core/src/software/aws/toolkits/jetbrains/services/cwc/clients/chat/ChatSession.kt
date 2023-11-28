// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.clients.chat

import kotlinx.coroutines.flow.Flow
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatRequestData
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatResponseEvent

/**
 * Interface for the API that interacts with the CodeWhispererChat service. Enables sending queries to the service
 * and receiving responses.
 */
interface ChatSession {
    val conversationId: String?
    fun chat(data: ChatRequestData): Flow<ChatResponseEvent>
}
