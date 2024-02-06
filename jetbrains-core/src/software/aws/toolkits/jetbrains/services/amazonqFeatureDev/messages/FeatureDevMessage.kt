// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonValue
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import java.time.Instant

sealed interface FeatureDevBaseMessage : AmazonQMessage

// === UI -> App Messages ===
sealed interface IncomingFeatureDevMessage : FeatureDevBaseMessage {

    data class ChatPrompt(
        val chatMessage: String,
        val command: String,
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingFeatureDevMessage

    data class NewTabCreated(
        val command: String,
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingFeatureDevMessage

    data class TabRemoved(
        val command: String,
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingFeatureDevMessage
}

// === UI -> App Messages ===

sealed class UiMessage(
    open val tabId: String?,
    open val type: String,
) : FeatureDevBaseMessage {
    val time = Instant.now().epochSecond
    val sender = "featureDevChat"
}

enum class FeatureDevMessageType(
    @field:JsonValue val json: String,
) {
    Answer("answer"),
    AnswerPart("answer-part"),
}

data class FeatureDevMessage(
    @JsonProperty("tabID") override val tabId: String,
    @JsonProperty("triggerID") val triggerId: String,
    val messageType: FeatureDevMessageType,
    val messageId: String,
    val message: String? = null,

) : UiMessage(
    tabId = tabId,
    type = "chatMessage",
)

data class AsyncEventProgressMessage(
    @JsonProperty("tabID") override val tabId: String,
    val message: String? = null,
    val inProgress: Boolean
) : UiMessage(
    tabId = tabId,
    type = "asyncEventProgressMessage"
)

data class UpdatePlaceholderMessage(
    @JsonProperty("tabID") override val tabId: String,
    val newPlaceholder: String
) : UiMessage(
    tabId = tabId,
    type = "updatePlaceholderMessage"
)

data class ErrorMessage(
    @JsonProperty("tabID") override val tabId: String,
    val title: String,
    val message: String,
) : UiMessage(
    tabId = tabId,
    type = "errorMessage",
)
