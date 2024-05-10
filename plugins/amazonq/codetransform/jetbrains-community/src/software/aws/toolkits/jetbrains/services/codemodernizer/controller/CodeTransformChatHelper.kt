// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.controller

import kotlinx.coroutines.delay
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessageContent
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessageType
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatUpdateMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformNotificationMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.session.ChatSessionStorage
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessageType
import java.util.UUID

class CodeTransformChatHelper(
    private val messagePublisher: MessagePublisher,
    private val chatSessionStorage: ChatSessionStorage
) {
    private var activeCodeTransformTabId: String? = null
    private var hilPomItemId: String? = null

    fun setActiveCodeTransformTabId(tabId: String) {
        activeCodeTransformTabId = tabId
    }

    fun getActiveCodeTransformTabId(): String? = activeCodeTransformTabId

    fun generateHilPomItemId(): String = UUID.randomUUID().toString().also { hilPomItemId = it }

    fun clearHilPomItemId() {
        hilPomItemId = null
    }

    fun getHilPomItemId(): String? = hilPomItemId

    suspend fun showChatNotification(title: String, content: String) {
        messagePublisher.publish(
            CodeTransformNotificationMessage(
                title = title,
                content = content,
            )
        )
    }

    suspend fun addNewMessage(
        content: CodeTransformChatMessageContent,
        messageIdOverride: String? = null,
        clearPreviousItemButtons: Boolean? = true
    ) {
        if (activeCodeTransformTabId == null || chatSessionStorage.getSession(activeCodeTransformTabId as String).isAuthenticating) {
            return
        }

        messagePublisher.publish(
            CodeTransformChatMessage(
                tabId = activeCodeTransformTabId as String,
                messageId = messageIdOverride ?: UUID.randomUUID().toString(),
                messageType = when (content.type) {
                    CodeTransformChatMessageType.PendingAnswer -> ChatMessageType.AnswerPart
                    CodeTransformChatMessageType.FinalizedAnswer -> ChatMessageType.Answer
                    CodeTransformChatMessageType.Prompt -> ChatMessageType.Prompt
                },
                message = content.message,
                buttons = content.buttons,
                formItems = content.formItems,
                followUps = content.followUps,
                isAddingNewItem = true,
                isLoading = content.type == CodeTransformChatMessageType.PendingAnswer,
                clearPreviousItemButtons = clearPreviousItemButtons as Boolean
            )
        )
    }

    suspend fun updateLastPendingMessage(content: CodeTransformChatMessageContent) {
        if (activeCodeTransformTabId == null || chatSessionStorage.getSession(activeCodeTransformTabId as String).isAuthenticating) {
            return
        }

        messagePublisher.publish(
            CodeTransformChatMessage(
                tabId = activeCodeTransformTabId as String,
                messageType = ChatMessageType.AnswerPart,
                message = content.message,
                buttons = content.buttons,
                formItems = content.formItems,
                followUps = content.followUps,
                isAddingNewItem = false,
                isLoading = content.type == CodeTransformChatMessageType.PendingAnswer
            )
        )
    }

    suspend fun updateExistingMessage(
        targetMessageId: String,
        content: CodeTransformChatMessageContent
    ) {
        messagePublisher.publish(
            CodeTransformChatUpdateMessage(
                tabId = activeCodeTransformTabId as String,
                targetMessageId = targetMessageId,
                message = content.message,
                buttons = content.buttons,
                formItems = content.formItems,
                followUps = content.followUps,
            )
        )
    }

    suspend fun chatDelayShort() {
        delay(500)
    }

    suspend fun chatDelayLong() {
        delay(2000)
    }
}
