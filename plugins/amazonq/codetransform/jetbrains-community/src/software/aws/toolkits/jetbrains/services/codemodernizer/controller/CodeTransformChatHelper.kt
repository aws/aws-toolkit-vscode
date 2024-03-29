// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.controller

import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessageContent
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessageType
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformNotificationMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.session.ChatSessionStorage
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessageType

class CodeTransformChatHelper(
    private val messagePublisher: MessagePublisher,
    private val chatSessionStorage: ChatSessionStorage
) {
    private var activeCodeTransformTabId: String? = null
    fun setActiveCodeTransformTabId(tabId: String) {
        activeCodeTransformTabId = tabId
    }

    fun getActiveCodeTransformTabId(): String? = activeCodeTransformTabId

    suspend fun showChatNotification(title: String, content: String) {
        messagePublisher.publish(
            CodeTransformNotificationMessage(
                title = title,
                content = content,
            )
        )
    }

    suspend fun addNewMessage(content: CodeTransformChatMessageContent) {
        if (activeCodeTransformTabId == null || chatSessionStorage.getSession(activeCodeTransformTabId as String).isAuthenticating) {
            return
        }

        messagePublisher.publish(
            CodeTransformChatMessage(
                tabId = activeCodeTransformTabId as String,
                messageType = when (content.type) {
                    CodeTransformChatMessageType.PendingAnswer -> ChatMessageType.AnswerPart
                    CodeTransformChatMessageType.FinalizedAnswer -> ChatMessageType.Answer
                    CodeTransformChatMessageType.Prompt -> ChatMessageType.Prompt
                },
                message = content.message,
                buttons = content.buttons,
                formItems = content.formItems,
                followUps = content.followUps,
                isAddingNewItem = true
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
            )
        )
    }
}
