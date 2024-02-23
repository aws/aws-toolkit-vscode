// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc

import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQApp
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import software.aws.toolkits.jetbrains.services.amazonq.onboarding.OnboardingPageInteraction
import software.aws.toolkits.jetbrains.services.cwc.commands.ActionRegistrar
import software.aws.toolkits.jetbrains.services.cwc.commands.ContextMenuActionMessage
import software.aws.toolkits.jetbrains.services.cwc.controller.ChatController
import software.aws.toolkits.jetbrains.services.cwc.messages.IncomingCwcMessage

class App : AmazonQApp {

    private val scope = disposableCoroutineScope(this)

    override val tabTypes = listOf("cwc")

    override fun init(context: AmazonQAppInitContext) {
        // Create CWC chat controller
        val inboundAppMessagesHandler: InboundAppMessagesHandler =
            ChatController(context)

        context.messageTypeRegistry.register(
            "clear" to IncomingCwcMessage.ClearChat::class,
            "help" to IncomingCwcMessage.Help::class,
            "chat-prompt" to IncomingCwcMessage.ChatPrompt::class,
            "tab-was-removed" to IncomingCwcMessage.TabRemoved::class,
            "tab-was-changed" to IncomingCwcMessage.TabChanged::class,
            "follow-up-was-clicked" to IncomingCwcMessage.FollowupClicked::class,
            "code_was_copied_to_clipboard" to IncomingCwcMessage.CopyCodeToClipboard::class,
            "insert_code_at_cursor_position" to IncomingCwcMessage.InsertCodeAtCursorPosition::class,
            "trigger-tabID-received" to IncomingCwcMessage.TriggerTabIdReceived::class,
            "stop-response" to IncomingCwcMessage.StopResponse::class,
            "chat-item-voted" to IncomingCwcMessage.ChatItemVoted::class,
            "chat-item-feedback" to IncomingCwcMessage.ChatItemFeedback::class,
            "ui-focus" to IncomingCwcMessage.UIFocus::class,
            "auth-follow-up-was-clicked" to IncomingCwcMessage.AuthFollowUpWasClicked::class,

            // JB specific (not in vscode)
            "transform" to IncomingCwcMessage.Transform::class,
            "source-link-click" to IncomingCwcMessage.ClickedLink::class,
            "response-body-link-click" to IncomingCwcMessage.ClickedLink::class,
            "footer-info-link-click" to IncomingCwcMessage.ClickedLink::class,
        )

        scope.launch {
            merge(ActionRegistrar.instance.flow, context.messagesFromUiToApp.flow).collect { message ->
                // Launch a new coroutine to handle each message
                scope.launch { handleMessage(message, inboundAppMessagesHandler) }
            }
        }
    }

    private suspend fun handleMessage(message: AmazonQMessage, inboundAppMessagesHandler: InboundAppMessagesHandler) {
        when (message) {
            is IncomingCwcMessage.ClearChat -> inboundAppMessagesHandler.processClearQuickAction(message)
            is IncomingCwcMessage.Help -> inboundAppMessagesHandler.processHelpQuickAction(message)
            is IncomingCwcMessage.Transform -> inboundAppMessagesHandler.processTransformQuickAction(message)
            is IncomingCwcMessage.ChatPrompt -> inboundAppMessagesHandler.processPromptChatMessage(message)
            is IncomingCwcMessage.TabRemoved -> inboundAppMessagesHandler.processTabWasRemoved(message)
            is IncomingCwcMessage.TabChanged -> inboundAppMessagesHandler.processTabChanged(message)
            is IncomingCwcMessage.FollowupClicked -> inboundAppMessagesHandler.processFollowUpClick(message)
            is IncomingCwcMessage.CopyCodeToClipboard -> inboundAppMessagesHandler.processCodeWasCopiedToClipboard(message)
            is IncomingCwcMessage.InsertCodeAtCursorPosition -> inboundAppMessagesHandler.processInsertCodeAtCursorPosition(message)
            is IncomingCwcMessage.StopResponse -> inboundAppMessagesHandler.processStopResponseMessage(message)
            is IncomingCwcMessage.ChatItemVoted -> inboundAppMessagesHandler.processChatItemVoted(message)
            is IncomingCwcMessage.ChatItemFeedback -> inboundAppMessagesHandler.processChatItemFeedback(message)
            is IncomingCwcMessage.UIFocus -> inboundAppMessagesHandler.processUIFocus(message)
            is IncomingCwcMessage.AuthFollowUpWasClicked -> inboundAppMessagesHandler.processAuthFollowUpClick(message)
            is OnboardingPageInteraction -> inboundAppMessagesHandler.processOnboardingPageInteraction(message)

            // JB specific (not in vscode)
            is ContextMenuActionMessage -> inboundAppMessagesHandler.processContextMenuCommand(message)
            is IncomingCwcMessage.ClickedLink -> inboundAppMessagesHandler.processLinkClick(message)
        }
    }

    override fun dispose() {
        // nothing to do
    }
}
