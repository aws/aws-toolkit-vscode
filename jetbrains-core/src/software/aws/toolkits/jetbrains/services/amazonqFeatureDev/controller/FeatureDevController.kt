// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller

import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.InboundAppMessagesHandler
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessageType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage
import java.util.UUID

class FeatureDevController(
    private val context: AmazonQAppInitContext
) : InboundAppMessagesHandler {

    override suspend fun processPromptChatMessage(message: IncomingFeatureDevMessage.ChatPrompt) {
        handleChat(
            tabId = message.tabId,
            message = message.chatMessage
        )
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

        context.messagesFromAppToUi.publish(reply)
    }
}
