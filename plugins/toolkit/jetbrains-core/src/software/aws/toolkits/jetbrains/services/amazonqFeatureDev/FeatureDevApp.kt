// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev

import com.intellij.openapi.application.ApplicationManager
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
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
            "follow-up-was-clicked" to IncomingFeatureDevMessage.FollowupClicked::class,
            "chat-item-voted" to IncomingFeatureDevMessage.ChatItemVotedMessage::class,
            "response-body-link-click" to IncomingFeatureDevMessage.ClickedLink::class,
            "insert_code_at_cursor_position" to IncomingFeatureDevMessage.InsertCodeAtCursorPosition::class,
            "open-diff" to IncomingFeatureDevMessage.OpenDiff::class
        )

        scope.launch {
            context.messagesFromUiToApp.flow.collect { message ->
                // Launch a new coroutine to handle each message
                scope.launch { handleMessage(message, inboundAppMessagesHandler) }
            }
        }

        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    scope.launch {
                        context.messagesFromAppToUi.publish(
                            AuthenticationUpdateMessage(
                                featureDevEnabled = isFeatureDevAvailable(context.project),
                                authenticatingTabIDs = chatSessionStorage.getAuthenticatingSessions().map { it.tabID }
                            )
                        )
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
            is IncomingFeatureDevMessage.FollowupClicked -> inboundAppMessagesHandler.processFollowupClickedMessage(message)
            is IncomingFeatureDevMessage.ChatItemVotedMessage -> inboundAppMessagesHandler.processChatItemVotedMessage(message)
            is IncomingFeatureDevMessage.ClickedLink -> inboundAppMessagesHandler.processLinkClick(message)
            is IncomingFeatureDevMessage.InsertCodeAtCursorPosition -> inboundAppMessagesHandler.processInsertCodeAtCursorPosition(message)
            is IncomingFeatureDevMessage.OpenDiff -> inboundAppMessagesHandler.processOpenDiff(message)
        }
    }

    override fun dispose() {
        // nothing to do
    }
}
