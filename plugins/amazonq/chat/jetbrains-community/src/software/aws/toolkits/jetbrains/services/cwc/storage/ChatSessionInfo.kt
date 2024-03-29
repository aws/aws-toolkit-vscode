// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.storage

import kotlinx.coroutines.CoroutineScope
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.ChatSession
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatRequestData

data class ChatSessionInfo(
    val session: ChatSession,
    val scope: CoroutineScope,
    val history: MutableList<ChatRequestData>,
)
