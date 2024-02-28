// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonValue
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthFollowUpType
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference
import software.aws.toolkits.jetbrains.services.cwc.messages.RecommendationContentSpan
import java.time.Instant
import java.util.UUID

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

    data class AuthFollowUpWasClicked(
        @JsonProperty("tabID") val tabId: String,
        val authType: AuthFollowUpType,
    ) : IncomingFeatureDevMessage

    data class TabRemoved(
        val command: String,
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingFeatureDevMessage

    data class FollowupClicked(
        val followUp: FollowUp,
        @JsonProperty("tabID") val tabId: String,
        val messageId: String?,
        val command: String,
    ) : IncomingFeatureDevMessage

    data class ChatItemVotedMessage(
        @JsonProperty("tabID") val tabId: String,
        val messageId: String,
        val vote: String,
    ) : IncomingFeatureDevMessage

    data class ClickedLink(
        @JsonProperty("tabID") val tabId: String,
        val command: String,
        val messageId: String?,
        val link: String,
    ) : IncomingFeatureDevMessage

    data class InsertCodeAtCursorPosition(
        @JsonProperty("tabID") val tabId: String,
        val code: String,
        val insertionTargetType: String?,
        val codeReference: List<CodeReference>?,
    ) : IncomingFeatureDevMessage

    data class OpenDiff(
        @JsonProperty("tabID") val tabId: String,
        val filePath: String,
        val deleted: Boolean
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
    AnswerStream("answer-stream"),
    SystemPrompt("system-prompt"),
}

data class FeatureDevMessage(
    @JsonProperty("tabID") override val tabId: String,
    @JsonProperty("triggerID") val triggerId: String,
    val messageType: FeatureDevMessageType,
    val messageId: String,
    val message: String? = null,
    val followUps: List<FollowUp>? = null,
    val canBeVoted: Boolean,

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

data class ChatInputEnabledMessage(
    @JsonProperty("tabID") override val tabId: String,
    val enabled: Boolean
) : UiMessage(
    tabId = tabId,
    type = "chatInputEnabledMessage"
)
data class ErrorMessage(
    @JsonProperty("tabID") override val tabId: String,
    val title: String,
    val message: String,
) : UiMessage(
    tabId = tabId,
    type = "errorMessage",
)

data class AuthenticationUpdateMessage(
    val authenticatingTabIDs: List<String>,
    val featureDevEnabled: Boolean,
    val gumbyEnabled: Boolean,
    val message: String? = null,
    val messageId: String = UUID.randomUUID().toString(),

) : UiMessage(
    null,
    type = "authenticationUpdateMessage",
)

data class AuthNeededException(
    @JsonProperty("tabID") override val tabId: String,
    @JsonProperty("triggerID") val triggerId: String,
    val authType: AuthFollowUpType,
    val message: String,
) : UiMessage(
    tabId = tabId,
    type = "authNeededException",
)

data class CodeResultMessage(
    @JsonProperty("tabID") override val tabId: String,
    val conversationId: String,
    val filePaths: List<String>,
    val deletedFiles: List<String>,
    val references: List<ReducedCodeReference>
) : UiMessage(
    tabId = tabId,
    type = "codeResultMessage"
)

data class FollowUp(
    val type: FollowUpTypes,
    val pillText: String,
    val disabled: Boolean? = false,
    val description: String? = null,
    val status: FollowUpStatusType? = null,
    val icon: FollowUpIcons? = null,
)

enum class FollowUpIcons(
    @field:JsonValue val json: String,
) {
    Ok("ok"),
    Refresh("refresh")
}

enum class FollowUpStatusType(
    @field:JsonValue val json: String,
) {
    Info("info"),
    Success("success"),
    Warning("warning"),
    Error("error")
}

enum class FollowUpTypes(
    @field:JsonValue val json: String
) {
    RETRY("Retry"),
    MODIFY_DEFAULT_SOURCE_FOLDER("ModifyDefaultSourceFolder"),
    DEV_EXAMPLES("DevExamples"),
    NEW_PLAN("NewPlan"),
    SEND_FEEDBACK("SendFeedback"),
    WRITE_CODE("WriteCode"),
    ACCEPT_CODE("AcceptCode"),
    PROVIDE_FEEDBACK_AND_REGENERATE_CODE("ProvideFeedbackAndRegenerateCode"),
    NEW_TASK("NewTask"),
    CLOSE_SESSION("CloseSession")
}

// Util classes
data class ReducedCodeReference(
    val information: String,
    val recommendationContentSpan: RecommendationContentSpan
)
