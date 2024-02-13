// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller
import com.intellij.ide.BrowserUtil
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
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.ContentLengthError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.DEFAULT_RETRY_LIMIT
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.InboundAppMessagesHandler
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.createUserFacingErrorMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessagePublisher
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
import software.aws.toolkits.telemetry.AmazonqTelemetry
import java.util.UUID

class FeatureDevController(
    private val context: AmazonQAppInitContext,
    private val chatSessionStorage: ChatSessionStorage
) : InboundAppMessagesHandler {

    private val authController = AuthController()
    private val featureDevMessagePublisher = FeatureDevMessagePublisher(messagePublisher = context.messagesFromAppToUi)

    override suspend fun processPromptChatMessage(message: IncomingFeatureDevMessage.ChatPrompt) {
        handleChat(
            tabId = message.tabId,
            message = message.chatMessage
        )
    }
    override suspend fun processNewTabCreatedMessage(message: IncomingFeatureDevMessage.NewTabCreated) {
        newTabOpened(message.tabId)
    }

    override suspend fun processTabRemovedMessage(message: IncomingFeatureDevMessage.TabRemoved) {
        chatSessionStorage.deleteSession(message.tabId)
    }

    override suspend fun processAuthFollowUpClick(message: IncomingFeatureDevMessage.AuthFollowUpWasClicked) {
        authController.handleAuth(context.project, message.authType)
        featureDevMessagePublisher.sendAuthenticationInProgressMessage(message.tabId) // show user that authentication is in progress
        featureDevMessagePublisher.sendChatInputEnabledMessage(message.tabId, enabled = false) // disable the input field while authentication is in progress
    }

    override suspend fun processFollowupClickedMessage(message: IncomingFeatureDevMessage.FollowupClicked) {
        when (message.followUp.type) {
            FollowUpTypes.RETRY -> retryRequests(message.tabId)
            FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER -> modifyDefaultSourceFolder(message.tabId)
            FollowUpTypes.DEV_EXAMPLES -> featureDevMessagePublisher.initialExamples(message.tabId)
            FollowUpTypes.NEW_PLAN -> newPlan(message.tabId)
            FollowUpTypes.SEND_FEEDBACK -> sendFeedback()
        }
    }

    override suspend fun processChatItemVotedMessage(message: IncomingFeatureDevMessage.ChatItemVotedMessage) {
        logger.debug { "$FEATURE_NAME: Processing ChatItemVotedMessage: $message" }

        val session = chatSessionStorage.getSession(message.tabId, context.project)
        when (session.sessionState.phase) {
            SessionStatePhase.APPROACH -> {
                when (message.vote) {
                    "upvote" -> {
                        AmazonqTelemetry.approachThumbsUp(amazonqConversationId = session.conversationId)
                    }
                    "downvote" -> {
                        AmazonqTelemetry.approachThumbsDown(amazonqConversationId = session.conversationId)
                    }
                }
            }
            SessionStatePhase.CODEGEN -> {
                when (message.vote) {
                    "upvote" -> {
                        AmazonqTelemetry.codeGenerationThumbsUp(amazonqConversationId = session.conversationId)
                    }
                    "downvote" -> {
                        AmazonqTelemetry.codeGenerationThumbsDown(amazonqConversationId = session.conversationId)
                    }
                }
            }
            SessionStatePhase.INIT, null -> {
                logger.error { "$FEATURE_NAME: ChatItemVotedMessage is received for a conversation that has ${session.sessionState.phase} phase" }
            }
        }
    }

    override suspend fun processLinkClick(message: IncomingFeatureDevMessage.ClickedLink) {
        BrowserUtil.browse(message.link)
    }

    private suspend fun newTabOpened(tabId: String) {
        var session: Session? = null
        try {
            session = getSessionInfo(tabId)
            logger.debug { "$FEATURE_NAME: Session created with id: ${session.tabID}" }

            val credentialState = authController.getAuthNeededStates(context.project).amazonQ
            if (credentialState != null) {
                featureDevMessagePublisher.sendAuthNeededException(
                    tabId = tabId,
                    triggerId = UUID.randomUUID().toString(),
                    credentialState = credentialState,
                )
                session.isAuthenticating = true
                return
            }
        } catch (err: Exception) {
            val message = createUserFacingErrorMessage(err.message)
            featureDevMessagePublisher.sendError(
                tabId = tabId,
                errMessage = message ?: message("amazonqFeatureDev.exception.request_failed"),
                retries = retriesRemaining(session),
                phase = session?.sessionState?.phase
            )
        }
    }

    private suspend fun handleChat(
        tabId: String,
        message: String,
    ) {
        var session: Session? = null
        try {
            logger.debug { "$FEATURE_NAME: Processing message: $message" }
            session = getSessionInfo(tabId)

            val credentialState = authController.getAuthNeededStates(context.project).amazonQ
            if (credentialState != null) {
                featureDevMessagePublisher.sendAuthNeededException(
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
            if (err is ContentLengthError) {
                featureDevMessagePublisher.sendError(
                    tabId = tabId,
                    errMessage = err.message,
                    retries = retriesRemaining(session)
                )
                featureDevMessagePublisher.sendAnswer(
                    tabId = tabId,
                    messageType = FeatureDevMessageType.SystemPrompt,
                    followUp = listOf(
                        FollowUp(
                            pillText = message("amazonqFeatureDev.follow_up.modify_source_folder"),
                            type = FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER,
                            status = FollowUpStatusType.Info,
                        )
                    ),
                )
            } else {
                val mssg = createUserFacingErrorMessage("$FEATURE_NAME request failed: ${err.cause?.message ?: err.message}")
                featureDevMessagePublisher.sendError(
                    tabId = tabId,
                    errMessage = mssg ?: message("amazonqFeatureDev.exception.request_failed"),
                    retries = retriesRemaining(session),
                    phase = session?.sessionState?.phase
                )
            }

            // Lock the chat input until they explicitly click one of the follow-ups
            featureDevMessagePublisher.sendChatInputEnabledMessage(tabId, enabled = false)
        }
    }

    /**
     * Handle a regular incoming message when a user is in the approach phase
     */
    private suspend fun onApproachGeneration(session: Session, message: String, tabId: String) {
        session.preloader(message, featureDevMessagePublisher)

        featureDevMessagePublisher.sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.create_plan"),
        )

        // Ensure that the loading icon stays showing
        featureDevMessagePublisher.sendAsyncEventProgress(
            tabId = tabId,
            inProgress = true,
        )

        featureDevMessagePublisher.sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.generating_approach"))

        val interactions = session.send(message)
        featureDevMessagePublisher.sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.iterate_plan"))

        featureDevMessagePublisher.sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.AnswerPart,
            message = interactions.content,
            canBeVoted = true
        )

        // Follow up with action items and complete the request stream
        featureDevMessagePublisher.sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.SystemPrompt,
            followUp = getFollowUpOptions(session.sessionState.phase),
        )

        // Unlock the prompt again so that users can iterate
        featureDevMessagePublisher.sendAsyncEventProgress(
            tabId = tabId,
            inProgress = false,
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
        var session: Session? = null
        try {
            featureDevMessagePublisher.sendAsyncEventProgress(
                tabId = tabId,
                inProgress = true,
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
            val message = createUserFacingErrorMessage("Failed to retry request: ${err.message}")
            featureDevMessagePublisher.sendError(
                tabId = tabId,
                errMessage = message ?: message("amazonqFeatureDev.exception.retry_request_failed"),
                retries = retriesRemaining(session),
                phase = session?.sessionState?.phase
            )
        } finally {
            // Finish processing the event
            featureDevMessagePublisher.sendAsyncEventProgress(
                tabId = tabId,
                inProgress = false,
            )
        }
    }

    private suspend fun newPlan(tabId: String) {
        // Old session for the tab is ending, delete it so we can create a new one for the message id
        chatSessionStorage.deleteSession(tabId)

        // Re-run the opening flow, where we check auth + create a session
        getSessionInfo(tabId)

        featureDevMessagePublisher.sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.create_new_plan"),
        )

        featureDevMessagePublisher.sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.new_plan"))
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

                featureDevMessagePublisher.sendAnswer(
                    tabId = tabId,
                    messageType = FeatureDevMessageType.SystemPrompt,
                    followUp = listOf(modifyFolderFollowUp),
                )
                return@withContext
            }

            if (selectedFolder.parent.path != uri.path) {
                logger.info { "Selected folder not in workspace: ${selectedFolder.path}" }

                featureDevMessagePublisher.sendAnswer(
                    tabId = tabId,
                    messageType = FeatureDevMessageType.Answer,
                    message = message("amazonqFeatureDev.follow_up.incorrect_source_folder"),
                )

                featureDevMessagePublisher.sendAnswer(
                    tabId = tabId,
                    messageType = FeatureDevMessageType.SystemPrompt,
                    followUp = listOf(modifyFolderFollowUp),
                )
                return@withContext
            }

            logger.info { "Selected correct folder inside workspace: ${selectedFolder.path}" }

            val session = getSessionInfo(tabId)
            session.context.projectRoot = selectedFolder

            featureDevMessagePublisher.sendAnswer(
                tabId = tabId,
                messageType = FeatureDevMessageType.Answer,
                message = message("amazonqFeatureDev.follow_up.modified_source_folder", selectedFolder.path),
            )
        }
    }

    private fun sendFeedback() {
        runInEdt {
            FeedbackDialog(project = context.project, productName = "Amazon Q FeatureDev").show()
        }
    }

    private fun getSessionInfo(tabId: String) = chatSessionStorage.getSession(tabId, context.project)

    private fun retriesRemaining(session: Session?): Int = session?.retries ?: DEFAULT_RETRY_LIMIT

    companion object {
        private val logger = getLogger<FeatureDevController>()
    }
}
