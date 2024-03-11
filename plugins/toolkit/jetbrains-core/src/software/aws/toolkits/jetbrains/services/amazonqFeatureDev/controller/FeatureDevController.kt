// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.contents.EmptyContent
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.diff.util.DiffUserDataKeys
import com.intellij.ide.BrowserUtil
import com.intellij.notification.NotificationAction
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.wm.ToolWindowManager
import kotlinx.coroutines.withContext
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.EDT
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthController
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindowFactory
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.CodeIterationLimitError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.ContentLengthError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.DEFAULT_RETRY_LIMIT
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.InboundAppMessagesHandler
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.PlanIterationLimitError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.createUserFacingErrorMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessageType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUp
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUpIcons
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUpStatusType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUpTypes
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.initialExamples
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswer
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAsyncEventProgress
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAuthNeededException
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAuthenticationInProgressMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendChatInputEnabledMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendCodeResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendSystemPrompt
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendUpdatePlaceholder
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.NewFileZipInfo
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.PrepareCodeGenerationState
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.Session
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.SessionStatePhase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.storage.ChatSessionStorage
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference
import software.aws.toolkits.jetbrains.ui.feedback.FeedbackDialog
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AmazonqTelemetry
import java.util.UUID

class FeatureDevController(
    private val context: AmazonQAppInitContext,
    private val chatSessionStorage: ChatSessionStorage
) : InboundAppMessagesHandler {

    private val authController = AuthController()
    private val messenger = context.messagesFromAppToUi
    private val toolWindow = ToolWindowManager.getInstance(context.project).getToolWindow(AmazonQToolWindowFactory.WINDOW_ID)

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
        messenger.sendAuthenticationInProgressMessage(message.tabId) // show user that authentication is in progress
        messenger.sendChatInputEnabledMessage(message.tabId, enabled = false) // disable the input field while authentication is in progress
    }

    override suspend fun processFollowupClickedMessage(message: IncomingFeatureDevMessage.FollowupClicked) {
        when (message.followUp.type) {
            FollowUpTypes.RETRY -> retryRequests(message.tabId)
            FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER -> modifyDefaultSourceFolder(message.tabId)
            FollowUpTypes.DEV_EXAMPLES -> messenger.initialExamples(message.tabId)
            FollowUpTypes.NEW_PLAN -> newPlan(message.tabId)
            FollowUpTypes.SEND_FEEDBACK -> sendFeedback()
            FollowUpTypes.GENERATE_CODE -> generateCodeClicked(message.tabId)
            FollowUpTypes.INSERT_CODE -> insertCode(message.tabId)
            FollowUpTypes.PROVIDE_FEEDBACK_AND_REGENERATE_CODE -> provideFeedbackAndRegenerateCode(message.tabId)
            FollowUpTypes.NEW_TASK -> newTask(message.tabId)
            FollowUpTypes.CLOSE_SESSION -> closeSession(message.tabId)
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

    override suspend fun processInsertCodeAtCursorPosition(message: IncomingFeatureDevMessage.InsertCodeAtCursorPosition) {
        logger.debug { "$FEATURE_NAME: Processing InsertCodeAtCursorPosition: $message" }

        withContext(EDT) {
            val editor: Editor = FileEditorManager.getInstance(context.project).selectedTextEditor ?: return@withContext

            val caret: Caret = editor.caretModel.primaryCaret
            val offset: Int = caret.offset

            WriteCommandAction.runWriteCommandAction(context.project) {
                if (caret.hasSelection()) {
                    editor.document.deleteString(caret.selectionStart, caret.selectionEnd)
                }
                editor.document.insertString(offset, message.code)
            }
        }
    }

    override suspend fun processOpenDiff(message: IncomingFeatureDevMessage.OpenDiff) {
        val session = getSessionInfo(message.tabId)

        AmazonqTelemetry.isReviewedChanges(amazonqConversationId = session.conversationId, enabled = true)

        val project = context.project
        val sessionState = session.sessionState

        when (sessionState) {
            is PrepareCodeGenerationState -> {
                runInEdt {
                    val existingFile = VfsUtil.findRelativeFile(message.filePath, session.context.projectRoot)

                    val leftDiffContent = if (existingFile == null) {
                        EmptyContent()
                    } else {
                        DiffContentFactory.getInstance().create(project, existingFile)
                    }

                    val newFileContent = sessionState.filePaths.find { it.zipFilePath == message.filePath }?.fileContent

                    val rightDiffContent = if (message.deleted || newFileContent == null) {
                        EmptyContent()
                    } else {
                        DiffContentFactory.getInstance().create(newFileContent)
                    }

                    val request = SimpleDiffRequest(message.filePath, leftDiffContent, rightDiffContent, null, null)
                    request.putUserData(DiffUserDataKeys.FORCE_READ_ONLY, true)

                    DiffManager.getInstance().showDiff(project, request)
                }
            }
            else -> {
                logger.error { "$FEATURE_NAME: OpenDiff event is received for a conversation that has ${session.sessionState.phase} phase" }
                messenger.sendError(
                    tabId = message.tabId,
                    errMessage = message("amazonqFeatureDev.exception.open_diff_failed"),
                    retries = 0,
                    phase = session.sessionState.phase
                )
            }
        }
    }

    private suspend fun newTabOpened(tabId: String) {
        var session: Session? = null
        try {
            session = getSessionInfo(tabId)
            logger.debug { "$FEATURE_NAME: Session created with id: ${session.tabID}" }

            val credentialState = authController.getAuthNeededStates(context.project).amazonQ
            if (credentialState != null) {
                messenger.sendAuthNeededException(
                    tabId = tabId,
                    triggerId = UUID.randomUUID().toString(),
                    credentialState = credentialState,
                )
                session.isAuthenticating = true
                return
            }
        } catch (err: Exception) {
            val message = createUserFacingErrorMessage(err.message)
            messenger.sendError(
                tabId = tabId,
                errMessage = message ?: message("amazonqFeatureDev.exception.request_failed"),
                retries = retriesRemaining(session),
                phase = session?.sessionState?.phase
            )
        }
    }

    private suspend fun generateCodeClicked(tabId: String) {
        val session = getSessionInfo(tabId)
        try {
            session.initCodegen(messenger)
            onCodeGeneration(session, "", tabId)
        } catch (err: Exception) {
            val message = createUserFacingErrorMessage(err.message)
            messenger.sendError(
                tabId = tabId,
                errMessage = message ?: message("amazonqFeatureDev.exception.request_failed"),
                retries = retriesRemaining(session),
                phase = session.sessionState.phase
            )
        }
    }

    private suspend fun insertCode(tabId: String) {
        var session: Session? = null
        try {
            session = getSessionInfo(tabId)

            AmazonqTelemetry.isAcceptedCodeChanges(amazonqConversationId = session.conversationId, enabled = true)

            var filePaths: List<NewFileZipInfo> = emptyList()
            var deletedFiles: List<String> = emptyList()
            var references: List<CodeReference> = emptyList()

            when (val state = session.sessionState) {
                is PrepareCodeGenerationState -> {
                    filePaths = state.filePaths
                    deletedFiles = state.deletedFiles
                    references = state.references
                }
            }

            session.insertChanges(filePaths = filePaths, deletedFiles = deletedFiles, references = references)

            messenger.sendAnswer(
                tabId = tabId,
                message = message("amazonqFeatureDev.code_generation.updated_code"),
                messageType = FeatureDevMessageType.Answer
            )

            messenger.sendSystemPrompt(
                tabId = tabId,
                followUp = listOf(
                    FollowUp(
                        pillText = message("amazonqFeatureDev.follow_up.new_task"),
                        type = FollowUpTypes.NEW_TASK,
                        status = FollowUpStatusType.Info
                    ),
                    FollowUp(
                        pillText = message("amazonqFeatureDev.follow_up.close_session"),
                        type = FollowUpTypes.CLOSE_SESSION,
                        status = FollowUpStatusType.Info
                    )
                )
            )

            // Ensure that chat input is enabled so that customers can iterate over code generation if they choose to do so
            messenger.sendChatInputEnabledMessage(tabId = tabId, enabled = true)
            messenger.sendUpdatePlaceholder(
                tabId = tabId,
                newPlaceholder = message("amazonqFeatureDev.placeholder.additional_improvements")
            )
        } catch (err: Exception) {
            val message = createUserFacingErrorMessage("Failed to insert code changes: ${err.message}")
            messenger.sendError(
                tabId = tabId,
                errMessage = message ?: message("amazonqFeatureDev.exception.insert_code_failed"),
                retries = retriesRemaining(session),
                phase = session?.sessionState?.phase
            )
        }
    }

    private suspend fun newTask(tabId: String) {
        closeSession(tabId)
        chatSessionStorage.deleteSession(tabId)

        newTabOpened(tabId)

        messenger.sendAnswer(tabId = tabId, messageType = FeatureDevMessageType.Answer, message = message("amazonqFeatureDev.chat_message.ask_for_new_task"))
        messenger.sendUpdatePlaceholder(tabId = tabId, newPlaceholder = message("amazonqFeatureDev.placeholder.new_plan"))
    }

    private suspend fun closeSession(tabId: String) {
        messenger.sendAnswer(tabId = tabId, messageType = FeatureDevMessageType.Answer, message = message("amazonqFeatureDev.chat_message.closed_session"))

        messenger.sendUpdatePlaceholder(tabId = tabId, newPlaceholder = message("amazonqFeatureDev.placeholder.closed_session"))
        messenger.sendChatInputEnabledMessage(tabId = tabId, enabled = false)

        val session = getSessionInfo(tabId)
        val sessionLatency = System.currentTimeMillis() - session.sessionStartTime
        AmazonqTelemetry.endChat(amazonqConversationId = session.conversationId, amazonqEndOfTheConversationLatency = sessionLatency.toDouble())
    }

    private suspend fun provideFeedbackAndRegenerateCode(tabId: String) {
        val session = getSessionInfo(tabId)

        AmazonqTelemetry.isProvideFeedbackForCodeGen(amazonqConversationId = session.conversationId, enabled = true)

        // Unblock the message button
        messenger.sendAsyncEventProgress(tabId = tabId, inProgress = false)

        messenger.sendAnswer(
            tabId = tabId,
            message = message("amazonqFeatureDev.code_generation.provide_code_feedback"),
            messageType = FeatureDevMessageType.Answer
        )
        messenger.sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.provide_code_feedback"))
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
                messenger.sendAuthNeededException(
                    tabId = tabId,
                    triggerId = UUID.randomUUID().toString(),
                    credentialState = credentialState,
                )
                session.isAuthenticating = true
                return
            }

            when (session.sessionState.phase) {
                SessionStatePhase.INIT, SessionStatePhase.APPROACH -> onApproachGeneration(session, message, tabId)
                SessionStatePhase.CODEGEN -> onCodeGeneration(session, message, tabId)
                else -> null
            }
        } catch (err: Exception) {
            logger.warn(err) { "Encountered ${err.message} for tabId: $tabId" }
            if (err is ContentLengthError) {
                messenger.sendError(
                    tabId = tabId,
                    errMessage = err.message,
                    retries = retriesRemaining(session)
                )
                messenger.sendSystemPrompt(
                    tabId = tabId,
                    followUp = listOf(
                        FollowUp(
                            pillText = message("amazonqFeatureDev.follow_up.modify_source_folder"),
                            type = FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER,
                            status = FollowUpStatusType.Info,
                        )
                    ),
                )
            } else if (err is PlanIterationLimitError) {
                messenger.sendError(tabId = tabId, errMessage = err.message, retries = retriesRemaining(session))
                messenger.sendSystemPrompt(
                    tabId = tabId,
                    followUp = listOf(
                        FollowUp(
                            pillText = message("amazonqFeatureDev.follow_up.new_plan"),
                            type = FollowUpTypes.NEW_PLAN,
                            status = FollowUpStatusType.Info,
                        ),
                        FollowUp(
                            pillText = message("amazonqFeatureDev.follow_up.generate_code"),
                            type = FollowUpTypes.GENERATE_CODE,
                            status = FollowUpStatusType.Info,
                        )
                    ),
                )
                messenger.sendUpdatePlaceholder(tabId = tabId, newPlaceholder = message("amazonqFeatureDev.placeholder.after_code_generation"))
            } else if (err is CodeIterationLimitError) {
                messenger.sendError(tabId = tabId, errMessage = err.message, retries = retriesRemaining(session))
                messenger.sendSystemPrompt(
                    tabId = tabId,
                    followUp = listOf(
                        FollowUp(
                            pillText = message("amazonqFeatureDev.follow_up.insert_code"),
                            type = FollowUpTypes.INSERT_CODE,
                            icon = FollowUpIcons.Ok,
                            status = FollowUpStatusType.Success,
                        )
                    ),
                )
            } else {
                val msg = createUserFacingErrorMessage("$FEATURE_NAME request failed: ${err.message ?: err.cause?.message}")
                messenger.sendError(
                    tabId = tabId,
                    errMessage = msg ?: message("amazonqFeatureDev.exception.request_failed"),
                    retries = retriesRemaining(session),
                    phase = session?.sessionState?.phase
                )
            }

            // Lock the chat input until they explicitly click one of the follow-ups
            messenger.sendChatInputEnabledMessage(tabId, enabled = false)
        }
    }

    /**
     * Handle a regular incoming message when a user is in the approach phase
     */
    private suspend fun onApproachGeneration(session: Session, message: String, tabId: String) {
        session.preloader(message, messenger)

        messenger.sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.create_plan"),
        )

        // Ensure that the loading icon stays showing
        messenger.sendAsyncEventProgress(tabId = tabId, inProgress = true)

        messenger.sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.generating_approach"))

        val interactions = session.send(message)
        messenger.sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.iterate_plan"))

        messenger.sendAnswerPart(tabId = tabId, message = interactions.content, canBeVoted = interactions.interactionSucceeded)

        if (interactions.interactionSucceeded) {
            messenger.sendAnswer(
                tabId = tabId,
                messageType = FeatureDevMessageType.Answer,
                message = message("amazonqFeatureDev.plan_generation.ask_for_feedback")
            )
        }

        // Follow up with action items and complete the request stream
        messenger.sendSystemPrompt(tabId = tabId, followUp = getFollowUpOptions(session.sessionState.phase, interactions.interactionSucceeded))

        // Unlock the prompt again so that users can iterate
        messenger.sendAsyncEventProgress(tabId = tabId, inProgress = false)
    }

    private suspend fun onCodeGeneration(session: Session, message: String, tabId: String) {
        messenger.sendAsyncEventProgress(
            tabId = tabId,
            inProgress = true,
            message = message("amazonqFeatureDev.chat_message.start_code_generation"),
        )

        try {
            messenger.sendAnswer(
                tabId = tabId,
                message = message("amazonqFeatureDev.chat_message.requesting_changes"),
                messageType = FeatureDevMessageType.AnswerStream,
            )

            messenger.sendUpdatePlaceholder(tabId = tabId, newPlaceholder = message("amazonqFeatureDev.placeholder.generating_code"))

            session.send(message) // Trigger code generation

            val state = session.sessionState

            var filePaths: List<NewFileZipInfo> = emptyList()
            var deletedFiles: List<String> = emptyList()
            var references: List<CodeReference> = emptyList()
            var uploadId = ""

            when (state) {
                is PrepareCodeGenerationState -> {
                    filePaths = state.filePaths
                    deletedFiles = state.deletedFiles
                    references = state.references
                    uploadId = state.uploadId
                }
            }

            // Atm this is the only possible path as codegen is mocked to return empty.
            if (filePaths.size or deletedFiles.size == 0) {
                messenger.sendAnswer(
                    tabId = tabId,
                    messageType = FeatureDevMessageType.Answer,
                    message = message("amazonqFeatureDev.code_generation.no_file_changes")
                )
                messenger.sendSystemPrompt(
                    tabId = tabId,
                    followUp = if (retriesRemaining(session) > 0) {
                        listOf(
                            FollowUp(
                                pillText = message("amazonqFeatureDev.follow_up.retry"),
                                type = FollowUpTypes.RETRY,
                                status = FollowUpStatusType.Warning
                            )
                        )
                    } else {
                        emptyList()
                    }
                )
                messenger.sendChatInputEnabledMessage(tabId = tabId, enabled = false) // Lock chat input until retry is clicked.
                return
            }

            messenger.sendCodeResult(tabId = tabId, uploadId = uploadId, filePaths = filePaths, deletedFiles = deletedFiles, references = references)

            messenger.sendSystemPrompt(tabId = tabId, followUp = getFollowUpOptions(session.sessionState.phase, interactionSucceeded = true))

            messenger.sendUpdatePlaceholder(tabId = tabId, newPlaceholder = message("amazonqFeatureDev.placeholder.after_code_generation"))
        } finally {
            messenger.sendAsyncEventProgress(tabId = tabId, inProgress = false) // Finish processing the event
            messenger.sendChatInputEnabledMessage(tabId = tabId, enabled = false) // Lock chat input until a follow-up is clicked.

            if (toolWindow != null && !toolWindow.isVisible) {
                notifyInfo(
                    title = message("amazonqFeatureDev.code_generation.notification_title"),
                    content = message("amazonqFeatureDev.code_generation.notification_message"),
                    project = context.project,
                    notificationActions = listOf(openChatNotificationAction())
                )
            }
        }
    }

    private fun openChatNotificationAction() = NotificationAction.createSimple(message("amazonqFeatureDev.code_generation.notification_open_link")) {
        toolWindow?.show()
    }

    private fun getFollowUpOptions(phase: SessionStatePhase?, interactionSucceeded: Boolean): List<FollowUp> {
        when (phase) {
            SessionStatePhase.APPROACH -> {
                return when (interactionSucceeded) {
                    true -> listOf(
                        FollowUp(
                            pillText = message("amazonqFeatureDev.follow_up.generate_code"),
                            type = FollowUpTypes.GENERATE_CODE,
                            status = FollowUpStatusType.Info,
                        )
                    )

                    false -> emptyList()
                }
            }
            SessionStatePhase.CODEGEN -> {
                return listOf(
                    FollowUp(
                        pillText = message("amazonqFeatureDev.follow_up.insert_code"),
                        type = FollowUpTypes.INSERT_CODE,
                        icon = FollowUpIcons.Ok,
                        status = FollowUpStatusType.Success
                    ),
                    FollowUp(
                        pillText = message("amazonqFeatureDev.follow_up.provide_feedback_and_regenerate"),
                        type = FollowUpTypes.PROVIDE_FEEDBACK_AND_REGENERATE_CODE,
                        icon = FollowUpIcons.Refresh,
                        status = FollowUpStatusType.Info
                    )
                )
            }
            else -> return emptyList()
        }
    }

    private suspend fun retryRequests(tabId: String) {
        var session: Session? = null
        try {
            messenger.sendAsyncEventProgress(
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
            messenger.sendError(
                tabId = tabId,
                errMessage = message ?: message("amazonqFeatureDev.exception.retry_request_failed"),
                retries = retriesRemaining(session),
                phase = session?.sessionState?.phase
            )
        } finally {
            // Finish processing the event
            messenger.sendAsyncEventProgress(
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

        messenger.sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.create_new_plan"),
        )

        messenger.sendUpdatePlaceholder(tabId, message("amazonqFeatureDev.placeholder.new_plan"))
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

                messenger.sendSystemPrompt(
                    tabId = tabId,
                    followUp = listOf(modifyFolderFollowUp),
                )
                return@withContext
            }

            if (selectedFolder.parent.path != uri.path) {
                logger.info { "Selected folder not in workspace: ${selectedFolder.path}" }

                messenger.sendAnswer(
                    tabId = tabId,
                    messageType = FeatureDevMessageType.Answer,
                    message = message("amazonqFeatureDev.follow_up.incorrect_source_folder"),
                )

                messenger.sendSystemPrompt(
                    tabId = tabId,
                    followUp = listOf(modifyFolderFollowUp),
                )
                return@withContext
            }

            logger.info { "Selected correct folder inside workspace: ${selectedFolder.path}" }

            val session = getSessionInfo(tabId)
            session.context.projectRoot = selectedFolder

            messenger.sendAnswer(
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
