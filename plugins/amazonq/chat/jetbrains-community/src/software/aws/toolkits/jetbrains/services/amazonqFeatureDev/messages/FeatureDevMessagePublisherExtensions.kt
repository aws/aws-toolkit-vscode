// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages

import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthNeededState
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.DeletedFileInfo
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.NewFileZipInfo
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.SessionStatePhase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.licenseText
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference
import software.aws.toolkits.resources.message
import java.util.UUID

suspend fun MessagePublisher.sendAnswer(
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
    this.publish(chatMessage)
}

suspend fun MessagePublisher.sendAnswerPart(
    tabId: String,
    message: String? = null,
    canBeVoted: Boolean? = null,
) {
    this.sendAnswer(
        tabId = tabId,
        message = message,
        messageType = FeatureDevMessageType.AnswerPart,
        canBeVoted = canBeVoted
    )
}

suspend fun MessagePublisher.sendSystemPrompt(
    tabId: String,
    followUp: List<FollowUp>
) {
    this.sendAnswer(
        tabId = tabId,
        messageType = FeatureDevMessageType.SystemPrompt,
        followUp = followUp
    )
}

suspend fun MessagePublisher.updateFileComponent(tabId: String, filePaths: List<NewFileZipInfo>, deletedFiles: List<DeletedFileInfo>) {
    val fileComponentMessage = FileComponent(
        tabId = tabId,
        filePaths = filePaths,
        deletedFiles = deletedFiles,
    )
    this.publish(fileComponentMessage)
}

suspend fun MessagePublisher.sendAsyncEventProgress(tabId: String, inProgress: Boolean, message: String? = null) {
    val asyncEventProgressMessage = AsyncEventProgressMessage(
        tabId = tabId,
        message = message,
        inProgress = inProgress,
    )
    this.publish(asyncEventProgressMessage)
}

suspend fun MessagePublisher.sendUpdatePlaceholder(tabId: String, newPlaceholder: String) {
    val updatePlaceholderMessage = UpdatePlaceholderMessage(
        tabId = tabId,
        newPlaceholder = newPlaceholder
    )
    this.publish(updatePlaceholderMessage)
}

suspend fun MessagePublisher.sendAuthNeededException(tabId: String, triggerId: String, credentialState: AuthNeededState) {
    val message = AuthNeededException(
        tabId = tabId,
        triggerId = triggerId,
        authType = credentialState.authType,
        message = credentialState.message,
    )
    this.publish(message)
}

private suspend fun MessagePublisher.sendErrorMessage(tabId: String, message: String, title: String) {
    val errorMessage = ErrorMessage(
        tabId = tabId,
        title = title,
        message = message
    )
    this.publish(errorMessage)
}

suspend fun MessagePublisher.sendAuthenticationInProgressMessage(tabId: String) {
    this.sendAnswer(
        tabId = tabId,
        messageType = FeatureDevMessageType.Answer,
        message = message("amazonqFeatureDev.follow_instructions_for_authentication"),
    )
}
suspend fun MessagePublisher.sendChatInputEnabledMessage(tabId: String, enabled: Boolean) {
    val chatInputEnabledMessage = ChatInputEnabledMessage(
        tabId,
        enabled,
    )
    this.publish(chatInputEnabledMessage)
}

suspend fun MessagePublisher.sendError(tabId: String, errMessage: String, retries: Int, phase: SessionStatePhase? = null) {
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

suspend fun MessagePublisher.initialExamples(tabId: String) {
    this.sendAnswer(
        tabId = tabId,
        messageType = FeatureDevMessageType.Answer,
        message = message("amazonqFeatureDev.example_text"),
    )
}

suspend fun MessagePublisher.sendCodeResult(
    tabId: String,
    uploadId: String,
    filePaths: List<NewFileZipInfo>,
    deletedFiles: List<DeletedFileInfo>,
    references: List<CodeReference>
) {
    // It is being done this mapping as featureDev currently doesn't support fully references.
    val refs = references.filter { it.licenseName != null && it.url != null && it.repository != null }.map {
        ReducedCodeReference(information = it.licenseText())
    }

    this.publish(
        CodeResultMessage(
            tabId = tabId,
            conversationId = uploadId,
            filePaths = filePaths,
            deletedFiles = deletedFiles,
            references = refs
        )
    )
}
