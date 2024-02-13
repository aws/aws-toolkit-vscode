// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller

import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthNeededState
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.AsyncEventProgressMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.AuthNeededException
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.ErrorMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessageType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUp
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.UpdatePlaceholderMessage
import software.aws.toolkits.resources.message
import java.util.UUID

suspend fun sendAnswer(
    tabId: String,
    message: String? = null,
    messageType: FeatureDevMessageType,
    followUp: List<FollowUp>? = null,
    canBeVoted: Boolean? = false,
    messagePublisher: MessagePublisher
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
    messagePublisher.publish(chatMessage)
}

suspend fun sendAsyncEventProgress(tabId: String, inProgress: Boolean, message: String? = null, messagePublisher: MessagePublisher) {
    val asyncEventProgressMessage = AsyncEventProgressMessage(
        tabId = tabId,
        message = message,
        inProgress = inProgress,
    )
    messagePublisher.publish(asyncEventProgressMessage)
}

suspend fun sendUpdatePlaceholder(tabId: String, newPlaceholder: String, messagePublisher: MessagePublisher) {
    val updatePlaceholderMessage = UpdatePlaceholderMessage(
        tabId = tabId,
        newPlaceholder = newPlaceholder
    )
    messagePublisher.publish(updatePlaceholderMessage)
}

suspend fun sendAuthNeededException(tabId: String, triggerId: String, credentialState: AuthNeededState, messagePublisher: MessagePublisher) {
    val message = AuthNeededException(
        tabId = tabId,
        triggerId = triggerId,
        authType = credentialState.authType,
        message = credentialState.message,
    )
    messagePublisher.publish(message)
}

suspend fun sendErrorMessage(tabId: String, message: String, title: String, messagePublisher: MessagePublisher) {
    val errorMessage = ErrorMessage(
        tabId = tabId,
        title = title,
        message = message
    )
    messagePublisher.publish(errorMessage)
}
