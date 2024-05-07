// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller

import com.intellij.notification.NotificationAction
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessageType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUp
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUpStatusType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUpTypes
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswer
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAsyncEventProgress
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendChatInputEnabledMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendCodeResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendSystemPrompt
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendUpdatePlaceholder
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.CodeReferenceGenerated
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.DeletedFileInfo
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.NewFileZipInfo
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.PrepareCodeGenerationState
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.Session
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.getFollowUpOptions
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

suspend fun FeatureDevController.onCodeGeneration(session: Session, message: String, tabId: String) {
    getLogger<FeatureDevController>().info { "Q - Dev chat conversation id ${session.conversationId}" }

    messenger.sendAsyncEventProgress(
        tabId = tabId,
        inProgress = true,
        message = message("amazonqFeatureDev.chat_message.start_code_generation"),
    )

    try {
        this.messenger.sendAnswer(
            tabId = tabId,
            message = message("amazonqFeatureDev.chat_message.requesting_changes"),
            messageType = FeatureDevMessageType.AnswerStream,
        )

        messenger.sendUpdatePlaceholder(tabId = tabId, newPlaceholder = message("amazonqFeatureDev.placeholder.generating_code"))

        session.send(message) // Trigger code generation

        val state = session.sessionState

        var filePaths: List<NewFileZipInfo> = emptyList()
        var deletedFiles: List<DeletedFileInfo> = emptyList()
        var references: List<CodeReferenceGenerated> = emptyList()
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
                project = getProject(),
                notificationActions = listOf(openChatNotificationAction())
            )
        }
    }
}

private fun FeatureDevController.openChatNotificationAction() = NotificationAction.createSimple(
    message("amazonqFeatureDev.code_generation.notification_open_link")
) {
    toolWindow?.show()
}
