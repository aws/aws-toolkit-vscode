// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller

import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.InboundAppMessagesHandler
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessageType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.storage.ChatSessionStorage
import java.util.UUID

class FeatureDevController private constructor(
    private val context: AmazonQAppInitContext,
    private val chatSessionStorage: ChatSessionStorage
) : InboundAppMessagesHandler {
    constructor(
        context: AmazonQAppInitContext,
    ) : this(
        context = context,
        chatSessionStorage = ChatSessionStorage(),
    )

    private val clientAdaptor = FeatureDevClient.getInstance(context.project)

    override suspend fun processPromptChatMessage(message: IncomingFeatureDevMessage.ChatPrompt) {
        handleChat(
            tabId = message.tabId,
            message = message.chatMessage
        )
    }
    override suspend fun processNewTabCreatedMessage(message: IncomingFeatureDevMessage.NewTabCreated) {
        getSessionInfo(message.tabId)
    }

    private suspend fun handleChat(
        tabId: String,
        message: String,
    ) {
        // TODO: Returning a dummy respond for now, to be removed once integrating with BE
        val reply = FeatureDevMessage(
            tabId = tabId,
            triggerId = UUID.randomUUID().toString(),
            messageId = UUID.randomUUID().toString(),
            messageType = FeatureDevMessageType.Answer,
            message = "ACK " + message + " Feature isn't ready yet",
        )

        getSessionInfo(tabId)
        clientAdaptor.createTaskAssistConversation()

        context.messagesFromAppToUi.publish(reply)
    }
    private fun getSessionInfo(tabId: String) = chatSessionStorage.getSession(tabId, context.project)
}
