// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthController
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthNeededState
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.InboundAppMessagesHandler
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.AsyncEventProgressMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.AuthNeededException
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.ChatInputEnabledMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.ErrorMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessageType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.UpdatePlaceholderMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.Session
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.SessionStatePhase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.storage.ChatSessionStorage
import software.aws.toolkits.resources.message
import java.util.UUID

class FeatureDevController(
    private val context: AmazonQAppInitContext,
    private val chatSessionStorage: ChatSessionStorage
) : InboundAppMessagesHandler {

    private val authController = AuthController()
    private val messagePublisher: MessagePublisher = context.messagesFromAppToUi

    override suspend fun processPromptChatMessage(message: IncomingFeatureDevMessage.ChatPrompt) {
        handleChat(
            tabId = message.tabId,
            message = message.chatMessage
        )
    }
    override suspend fun processNewTabCreatedMessage(message: IncomingFeatureDevMessage.NewTabCreated) {
        getSessionInfo(message.tabId)
    }

    override suspend fun processTabRemovedMessage(message: IncomingFeatureDevMessage.TabRemoved) {
        chatSessionStorage.deleteSession(message.tabId)
    }

    override suspend fun processAuthFollowUpClick(message: IncomingFeatureDevMessage.AuthFollowUpWasClicked) {
        authController.handleAuth(context.project, message.authType)
        sendAuthenticationInProgressMessage(message.tabId) // show user that authentication is in progress
        sendChatInputEnabledMessage(message.tabId, enabled = false) // disable the input field while authentication is in progress
    }

    private suspend fun handleChat(
        tabId: String,
        message: String,
    ) {
        val session: Session
        try {
            logger.debug { "$FEATURE_NAME: Processing message: $message" }
            session = getSessionInfo(tabId)

            val credentialState = authController.getAuthNeededStates(context.project).amazonQ
            if (credentialState != null) {
                sendAuthNeededException(
                    tabId = tabId,
                    triggerId = UUID.randomUUID().toString(),
                    credentialState = credentialState,
                )
                session.isAuthenticating = true
                return
            }

            when (session.sessionState.phase) {
                SessionStatePhase.INIT, SessionStatePhase.APPROACH -> {
                    onApproachGeneration(session, message, tabId)
                }
                else -> null
            }
        } catch (err: Exception) {
            logger.warn(err) { "Encountered ${err.message} for tabId: $tabId" }
            sendErrorMessage(tabId, err.message ?: "Request failed")
        }
    }

    /**
     * Handle a regular incoming message when a user is in the approach phase
     */
    private suspend fun onApproachGeneration(session: Session, message: String, tabId: String) {
        session.preloader(message, messagePublisher)

        val reply = FeatureDevMessage(
            tabId = tabId,
            triggerId = UUID.randomUUID().toString(),
            messageId = "",
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.create_plan"),
        )
        messagePublisher.publish(reply)

        // Ensure that the loading icon stays showing
        sendAsyncEventProgress(tabId, true, null)

        sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.generating_approach"))

        val interactions = session.send(message)
        sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.iterate_plan"))

        val afterApproachReply = FeatureDevMessage(
            tabId = tabId,
            triggerId = UUID.randomUUID().toString(),
            messageId = "",
            messageType = FeatureDevMessageType.AnswerPart,
            message = interactions.content,
        )
        messagePublisher.publish(afterApproachReply)

        // Unlock the prompt again so that users can iterate
        sendAsyncEventProgress(tabId, false, null)
    }

    private fun getSessionInfo(tabId: String) = chatSessionStorage.getSession(tabId, context.project)

    private suspend fun sendAuthNeededException(tabId: String, triggerId: String, credentialState: AuthNeededState) {
        val message = AuthNeededException(
            tabId = tabId,
            triggerId = triggerId,
            authType = credentialState.authType,
            message = credentialState.message,
        )
        context.messagesFromAppToUi.publish(message)
    }

    private suspend fun sendErrorMessage(tabId: String, message: String) {
        val errorMessage = ErrorMessage(
            tabId = tabId,
            title = "An error occurred while processing your request.",
            message = message
        )
        messagePublisher.publish(errorMessage)
    }

    private suspend fun sendAsyncEventProgress(tabId: String, inProgress: Boolean, message: String?) {
        val asyncEventProgressMessage = AsyncEventProgressMessage(
            tabId = tabId,
            message = message,
            inProgress = inProgress,
        )
        messagePublisher.publish(asyncEventProgressMessage)
    }

    private suspend fun sendUpdatePlaceholder(tabId: String, newPlaceholder: String) {
        val updatePlaceholderMessage = UpdatePlaceholderMessage(
            tabId = tabId,
            newPlaceholder = newPlaceholder
        )
        messagePublisher.publish(updatePlaceholderMessage)
    }

    private suspend fun sendAuthenticationInProgressMessage(tabId: String) {
        val authenticationFollowReply = FeatureDevMessage(
            tabId = tabId,
            triggerId = UUID.randomUUID().toString(),
            messageId = UUID.randomUUID().toString(),
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.follow_instructions_for_authentication")
        )
        messagePublisher.publish(authenticationFollowReply)
    }

    private suspend fun sendChatInputEnabledMessage(tabId: String, enabled: Boolean) {
        val chatInputEnabledMessage = ChatInputEnabledMessage(
            tabId,
            enabled,
        )
        messagePublisher.publish(chatInputEnabledMessage)
    }
    companion object {
        private val logger = getLogger<FeatureDevController>()
    }
}
