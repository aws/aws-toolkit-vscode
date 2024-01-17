// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev

import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQApp
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller.FeatureDevController
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage

class FeatureDevApp : AmazonQApp {

    private val scope = disposableCoroutineScope(this)

    override val tabTypes = listOf("featuredev")

    override fun init(context: AmazonQAppInitContext) {
        // Create FeatureDev controller
        val inboundAppMessagesHandler =
            FeatureDevController(context)

        context.messageTypeRegistry.register(
            "chat-prompt" to IncomingFeatureDevMessage.ChatPrompt::class,
        )

        scope.launch {
            context.messagesFromUiToApp.flow.collect { message ->
                // Launch a new coroutine to handle each message
                scope.launch { handleMessage(message, inboundAppMessagesHandler) }
            }
        }
    }

    private suspend fun handleMessage(message: AmazonQMessage, inboundAppMessagesHandler: InboundAppMessagesHandler) {
        when (message) {
            is IncomingFeatureDevMessage.ChatPrompt -> inboundAppMessagesHandler.processPromptChatMessage(message)
        }
    }

    override fun dispose() {
        // nothing to do
    }
}
