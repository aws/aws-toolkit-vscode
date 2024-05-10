// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.messages

import com.fasterxml.jackson.annotation.JsonProperty
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthFollowUpType
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessageType
import software.aws.toolkits.jetbrains.services.cwc.messages.FollowUp
import java.time.Instant
import java.util.UUID

const val CODE_TRANSFORM_TAB_NAME = "codetransform"

sealed interface CodeTransformBaseMessage : AmazonQMessage

enum class CodeTransformButtonId(val id: String) {
    StartTransformation("codetransform-input-confirm"),
    CancelTransformation("codetransform-input-cancel"),
    StopTransformation("stop_transform"),
    OpenTransformationHub("open_transformation_hub"),
    OpenMvnBuild("open_mvn_build"),
    ViewDiff("view_diff"),
    ViewSummary("view_summary"),
    ConfirmHilSelection("confirm_hil_selection"),
    RejectHilSelection("reject_hil_selection"),
    OpenDependencyErrorPom("open_dependency_error_pom"),
}

enum class CodeTransformFormItemId(val id: String) {
    SelectModule("module"),
    SelectTargetVersion("targetVersion"),
    DependencyVersion("dependencyVersion"),
}

data class Button(
    val id: String,
    val text: String,
    val description: String? = null,
    val icon: String? = null,
    val keepCardAfterClick: Boolean? = false,
    val disabled: Boolean? = false,
    val waitMandatoryFormItems: Boolean? = false,
)

data class FormItemOption(
    val label: String,
    val value: String,
)
data class FormItem(
    val id: String,
    val type: String = "select",
    val title: String,
    val mandatory: Boolean = true,
    val options: List<FormItemOption> = emptyList(),
)

// === UI -> App Messages ===
sealed interface IncomingCodeTransformMessage : CodeTransformBaseMessage {
    data class CodeTransformNew(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage
    data class Transform(
        @JsonProperty("tabID") val tabId: String,
        val startNewTransform: Boolean = false,
    ) : IncomingCodeTransformMessage

    data class CodeTransformStart(
        @JsonProperty("tabID") val tabId: String,
        val modulePath: String,
        val targetVersion: String,
    ) : IncomingCodeTransformMessage

    data class CodeTransformStop(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage

    data class CodeTransformCancel(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage

    data class CodeTransformOpenMvnBuild(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage

    data class CodeTransformOpenTransformHub(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage

    data class CodeTransformViewDiff(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage

    data class CodeTransformViewSummary(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage

    data class TabCreated(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage

    data class TabRemoved(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage

    data class AuthFollowUpWasClicked(
        @JsonProperty("tabID") val tabId: String,
        val authType: AuthFollowUpType,
    ) : IncomingCodeTransformMessage

    data class BodyLinkClicked(
        @JsonProperty("tabID") val tabId: String,
        val command: String,
        val messageId: String?,
        val link: String,
    ) : IncomingCodeTransformMessage

    data class ConfirmHilSelection(
        @JsonProperty("tabID") val tabId: String,
        val version: String,
    ) : IncomingCodeTransformMessage

    data class RejectHilSelection(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage

    data class OpenPomFileHilClicked(
        @JsonProperty("tabID") val tabId: String,
    ) : IncomingCodeTransformMessage
}

// === App -> UI messages ===
sealed class CodeTransformUiMessage(
    open val tabId: String?,
    open val type: String,
    open val messageId: String? = UUID.randomUUID().toString(),
) : CodeTransformBaseMessage {
    val time = Instant.now().epochSecond
    val sender = CODE_TRANSFORM_TAB_NAME
}

data class AuthenticationNeededExceptionMessage(
    @JsonProperty("tabID") override val tabId: String,
    val authType: AuthFollowUpType,
    val message: String? = null,
) : CodeTransformUiMessage(
    tabId = tabId,
    type = "authNeededException",
)
data class AuthenticationUpdateMessage(
    val authenticatingTabIDs: List<String>,
    val featureDevEnabled: Boolean,
    val codeTransformEnabled: Boolean,
    val message: String? = null,
) : CodeTransformUiMessage(
    null,
    type = "authenticationUpdateMessage",
)

data class CodeTransformChatMessage(
    @JsonProperty("tabID") override val tabId: String,
    override val messageId: String? = UUID.randomUUID().toString(),
    val messageType: ChatMessageType,
    val message: String? = null,
    val buttons: List<Button>? = null,
    val formItems: List<FormItem>? = null,
    val followUps: List<FollowUp>? = null,
    val isAddingNewItem: Boolean = true,
    val isLoading: Boolean = false,
    val clearPreviousItemButtons: Boolean = true,
) : CodeTransformUiMessage(
    messageId = messageId,
    tabId = tabId,
    type = "chatMessage",
)

data class CodeTransformCommandMessage(
    val command: String,
) : CodeTransformUiMessage(
    tabId = null,
    type = "codeTransformCommandMessage",
)

data class CodeTransformNotificationMessage(
    val title: String,
    val content: String,
) : CodeTransformUiMessage(
    tabId = null,
    type = "codeTransformNotificationMessage",
)

data class CodeTransformChatUpdateMessage(
    @JsonProperty("tabID") override val tabId: String,
    val targetMessageId: String,
    val message: String? = null,
    val buttons: List<Button>? = null,
    val formItems: List<FormItem>? = null,
    val followUps: List<FollowUp>? = null,
) : CodeTransformUiMessage(
    tabId = tabId,
    type = "codeTransformChatUpdateMessage",
)

enum class CodeTransformChatMessageType {
    Prompt,
    PendingAnswer,
    FinalizedAnswer,
}
data class CodeTransformChatMessageContent(
    val message: String? = null,
    val buttons: List<Button>? = null,
    val formItems: List<FormItem>? = null,
    val followUps: List<FollowUp>? = null,
    val type: CodeTransformChatMessageType,
)
