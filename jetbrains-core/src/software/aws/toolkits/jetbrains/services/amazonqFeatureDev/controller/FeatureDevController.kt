// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.guessProjectDir
import kotlinx.coroutines.withContext
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.EDT
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthController
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.InboundAppMessagesHandler
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.ChatInputEnabledMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessageType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUp
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUpStatusType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUpTypes
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.Session
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.SessionStatePhase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.storage.ChatSessionStorage
import software.aws.toolkits.jetbrains.ui.feedback.FeedbackDialog
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

    override suspend fun processFollowupClickedMessage(message: IncomingFeatureDevMessage.FollowupClicked) {
        when (message.followUp.type) {
            FollowUpTypes.RETRY -> retryRequests(message.tabId)
            FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER -> modifyDefaultSourceFolder(message.tabId)
            FollowUpTypes.DEV_EXAMPLES -> initialExamples(message.tabId)
            FollowUpTypes.NEW_PLAN -> newPlan(message.tabId)
            FollowUpTypes.SEND_FEEDBACK -> sendFeedback()
        }
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
                    messagePublisher = messagePublisher
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
            sendErrorMessage(tabId, err.message ?: message("amazonqFeatureDev.exception.request_failed"), messagePublisher)
        }
    }

    /**
     * Handle a regular incoming message when a user is in the approach phase
     */
    private suspend fun onApproachGeneration(session: Session, message: String, tabId: String) {
        session.preloader(message, messagePublisher)

        sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.create_plan"),
            messagePublisher = messagePublisher
        )

        // Ensure that the loading icon stays showing
        sendAsyncEventProgress(
            tabId = tabId,
            inProgress = true,
            messagePublisher = messagePublisher
        )

        sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.generating_approach"), messagePublisher)

        val interactions = session.send(message)
        sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.iterate_plan"), messagePublisher)

        sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.AnswerPart,
            message = interactions.content,
            messagePublisher = messagePublisher
        )

        // Follow up with action items and complete the request stream
        sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.SystemPrompt,
            followUp = getFollowUpOptions(session.sessionState.phase),
            messagePublisher = messagePublisher
        )

        // Unlock the prompt again so that users can iterate
        sendAsyncEventProgress(
            tabId = tabId,
            inProgress = false,
            messagePublisher = messagePublisher
        )
    }

    private fun getFollowUpOptions(phase: SessionStatePhase?): List<FollowUp> {
        when (phase) {
            SessionStatePhase.APPROACH -> {
                return listOf(
                    FollowUp(
                        pillText = message("amazonqFeatureDev.follow_up.new_plan"),
                        type = FollowUpTypes.NEW_PLAN,
                        status = FollowUpStatusType.Info,
                    )
                )
            }
            else -> return emptyList()
        }
    }

    private suspend fun retryRequests(tabId: String) {
        val session: Session
        try {
            sendAsyncEventProgress(
                tabId = tabId,
                inProgress = true,
                messagePublisher = messagePublisher
            )
            session = getSessionInfo(tabId)

            // Decrease retries before making this request, just in case this one fails as well
            session.decreaseRetries()

            // Sending an empty message will re-run the last state with the previous values
            handleChat(
                tabId = tabId,
                message = session.latestMessage
            )
        } catch (err: Exception) {
            logger.error(err) { "Failed to retry request: ${err.message}" }
            sendErrorMessage(tabId, err.message ?: message("amazonqFeatureDev.exception.retry_request_failed"), messagePublisher)
        } finally {
            // Finish processing the event
            sendAsyncEventProgress(
                tabId = tabId,
                inProgress = false,
                messagePublisher = messagePublisher
            )
        }
    }

    private suspend fun initialExamples(tabId: String) {
        sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.example_text"),
            messagePublisher = messagePublisher
        )
    }

    private suspend fun newPlan(tabId: String) {
        // Old session for the tab is ending, delete it so we can create a new one for the message id
        chatSessionStorage.deleteSession(tabId)

        // Re-run the opening flow, where we check auth + create a session
        getSessionInfo(tabId)

        sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.create_new_plan"),
            messagePublisher = messagePublisher
        )

        sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.new_plan"), messagePublisher)
    }

    private suspend fun modifyDefaultSourceFolder(tabId: String) {
        val uri = context.project.guessProjectDir() ?: error("Cannot guess base directory for project ${context.project.name}")
        val fileChooserDescriptor = FileChooserDescriptorFactory.createSingleFolderDescriptor()

        val modifyFolderFollowUp = FollowUp(
            pillText = message("amazonqFeatureDev.follow_up.modify_source_folder"),
            type = FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER,
            status = FollowUpStatusType.Info,
        )

        withContext(EDT) {
            val selectedFolder = FileChooser.chooseFile(fileChooserDescriptor, context.project, uri)
            if (selectedFolder == null) {
                logger.info { "Cancelled dialog and not selected any folder" }

                sendAnswer(
                    tabId = tabId,
                    messageType = FeatureDevMessageType.SystemPrompt,
                    followUp = listOf(modifyFolderFollowUp),
                    messagePublisher = messagePublisher
                )
                return@withContext
            }

            if (selectedFolder.parent.path != uri.path) {
                logger.info { "Selected folder not in workspace: ${selectedFolder.path}" }

                sendAnswer(
                    tabId = tabId,
                    messageType = FeatureDevMessageType.Answer,
                    message = message("amazonqFeatureDev.follow_up.incorrect_source_folder"),
                    messagePublisher = messagePublisher
                )

                sendAnswer(
                    tabId = tabId,
                    messageType = FeatureDevMessageType.SystemPrompt,
                    followUp = listOf(modifyFolderFollowUp),
                    messagePublisher = messagePublisher
                )
                return@withContext
            }

            logger.info { "Selected correct folder inside workspace: ${selectedFolder.path}" }

            // TO-DO : Update source folder in session-context source root

            sendAnswer(
                tabId = tabId,
                messageType = FeatureDevMessageType.Answer,
                message = message("amazonqFeatureDev.follow_up.modified_source_folder", selectedFolder.path),
                messagePublisher = messagePublisher
            )
        }
    }

    private fun sendFeedback() {
        runInEdt {
            FeedbackDialog(project = context.project, productName = "Amazon Q FeatureDev").show()
        }
    }

    private fun getSessionInfo(tabId: String) = chatSessionStorage.getSession(tabId, context.project)

    private suspend fun sendAuthenticationInProgressMessage(tabId: String) {
        sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.follow_instructions_for_authentication"),
            messagePublisher = messagePublisher
        )
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
