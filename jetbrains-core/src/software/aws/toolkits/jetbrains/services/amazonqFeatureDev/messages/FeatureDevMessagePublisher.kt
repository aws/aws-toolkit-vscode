// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages

import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthNeededState
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.SessionStatePhase
import software.aws.toolkits.resources.message
import java.util.UUID

class FeatureDevMessagePublisher(private val messagePublisher: MessagePublisher) {
    suspend fun sendAnswer(
        tabId: String,
        message: String? = null,
        messageType: FeatureDevMessageType,
        followUp: List<FollowUp>? = null,
        canBeVoted: Boolean? = false,
    ) {
        val chatMessage =
            FeatureDevMessage(
                tabId = tabId,
                triggerId = UUID.randomUUID().toString(),
                messageId = UUID.randomUUID().toString(),
                messageType = messageType,
                message = message,
                followUps = followUp,
                canBeVoted = canBeVoted ?: false
            )
        this.messagePublisher.publish(chatMessage)
    }

    suspend fun sendAsyncEventProgress(tabId: String, inProgress: Boolean, message: String? = null) {
        val asyncEventProgressMessage = AsyncEventProgressMessage(
            tabId = tabId,
            message = message,
            inProgress = inProgress,
        )
        this.messagePublisher.publish(asyncEventProgressMessage)
    }

    suspend fun sendUpdatePlaceholder(tabId: String, newPlaceholder: String) {
        val updatePlaceholderMessage = UpdatePlaceholderMessage(
            tabId = tabId,
            newPlaceholder = newPlaceholder
        )
        this.messagePublisher.publish(updatePlaceholderMessage)
    }

    suspend fun sendAuthNeededException(tabId: String, triggerId: String, credentialState: AuthNeededState) {
        val message = AuthNeededException(
            tabId = tabId,
            triggerId = triggerId,
            authType = credentialState.authType,
            message = credentialState.message,
        )
        this.messagePublisher.publish(message)
    }

    private suspend fun sendErrorMessage(tabId: String, message: String, title: String) {
        val errorMessage = ErrorMessage(
            tabId = tabId,
            title = title,
            message = message
        )
        this.messagePublisher.publish(errorMessage)
    }

    suspend fun sendAuthenticationInProgressMessage(tabId: String) {
        this.sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.follow_instructions_for_authentication"),
        )
    }
    suspend fun sendChatInputEnabledMessage(tabId: String, enabled: Boolean) {
        val chatInputEnabledMessage = ChatInputEnabledMessage(
            tabId,
            enabled,
        )
        this.messagePublisher.publish(chatInputEnabledMessage)
    }

    suspend fun sendError(tabId: String, errMessage: String, retries: Int, phase: SessionStatePhase? = null) {
        if (retries == 0) {
            this.sendErrorMessage(
                tabId = tabId,
                title = message("amazonqFeatureDev.no_retries.error_text"),
                message = errMessage,
            )

            this.sendAnswer(
                tabId = tabId,
                messageType = FeatureDevMessageType.SystemPrompt,
                followUp = listOf(
                    FollowUp(
                        pillText = message("amazonqFeatureDev.follow_up.send_feedback"),
                        type = FollowUpTypes.SEND_FEEDBACK,
                        status = FollowUpStatusType.Info
                    )
                ),
            )
            return
        }

        when (phase) {
            SessionStatePhase.APPROACH -> {
                this.sendErrorMessage(
                    tabId = tabId,
                    title = message("amazonqFeatureDev.approach_gen.error_text"),
                    message = errMessage,
                )
            }
            else -> {
                this.sendErrorMessage(
                    tabId = tabId,
                    title = message("amazonqFeatureDev.error_text"),
                    message = errMessage,
                )
            }
        }

        this.sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.SystemPrompt,
            followUp = listOf(
                FollowUp(
                    pillText = message("amazonqFeatureDev.follow_up.retry"),
                    type = FollowUpTypes.RETRY,
                    status = FollowUpStatusType.Warning
                )
            ),
        )
    }

    suspend fun initialExamples(tabId: String) {
        this.sendAnswer(
            tabId = tabId,
            messageType = FeatureDevMessageType.Answer,
            message = message("amazonqFeatureDev.example_text"),
        )
    }
}
