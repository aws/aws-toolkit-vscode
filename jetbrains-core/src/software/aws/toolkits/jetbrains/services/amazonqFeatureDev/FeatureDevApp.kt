// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev

import com.intellij.openapi.application.ApplicationManager
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQApp
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.auth.isFeatureDevAvailable
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller.FeatureDevController
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.AuthenticationUpdateMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.storage.ChatSessionStorage

class FeatureDevApp : AmazonQApp {

    private val scope = disposableCoroutineScope(this)

    override val tabTypes = listOf("featuredev")

    override fun init(context: AmazonQAppInitContext) {
        val chatSessionStorage = ChatSessionStorage()
        // Create FeatureDev controller
        val inboundAppMessagesHandler =
            FeatureDevController(context, chatSessionStorage)

        context.messageTypeRegistry.register(
            "chat-prompt" to IncomingFeatureDevMessage.ChatPrompt::class,
            "new-tab-was-created" to IncomingFeatureDevMessage.NewTabCreated::class,
            "tab-was-removed" to IncomingFeatureDevMessage.TabRemoved::class,
            "auth-follow-up-was-clicked" to IncomingFeatureDevMessage.AuthFollowUpWasClicked::class,
        )

        scope.launch {
            context.messagesFromUiToApp.flow.collect { message ->
                // Launch a new coroutine to handle each message
                scope.launch { handleMessage(message, inboundAppMessagesHandler) }
            }
        }

        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun onChange(providerId: String) {
                    if (isFeatureDevAvailable(context.project)) {
                        scope.launch {
                            context.messagesFromAppToUi.publish(
                                AuthenticationUpdateMessage(
                                    featureDevEnabled = true,
                                    authenticatingTabIDs = chatSessionStorage.getAuthenticatingSessions().map { it.tabID }
                                )
                            )
                        }
                    }
                }
            }
        )
    }

    private suspend fun handleMessage(message: AmazonQMessage, inboundAppMessagesHandler: InboundAppMessagesHandler) {
        when (message) {
            is IncomingFeatureDevMessage.ChatPrompt -> inboundAppMessagesHandler.processPromptChatMessage(message)
            is IncomingFeatureDevMessage.NewTabCreated -> inboundAppMessagesHandler.processNewTabCreatedMessage(message)
            is IncomingFeatureDevMessage.TabRemoved -> inboundAppMessagesHandler.processTabRemovedMessage(message)
            is IncomingFeatureDevMessage.AuthFollowUpWasClicked -> inboundAppMessagesHandler.processAuthFollowUpClick(message)
        }
    }

    override fun dispose() {
        // nothing to do
    }
}
