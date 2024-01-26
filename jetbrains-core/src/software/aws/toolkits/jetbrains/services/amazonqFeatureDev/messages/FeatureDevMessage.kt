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
