// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cwc.clients.chat.model

data class ChatResponseEvent(
    val requestId: String,
    val statusCode: Int,
    val token: String?,
    val followUps: List<SuggestedFollowUp>?,
    val suggestions: List<Suggestion>?,
    val codeReferences: List<Reference>?,
    val query: String?,
)

enum class FollowUpType {
    Alternatives,
    CommonPractices,
    Improvements,
    MoreExamples,
    CiteSources,
    LineByLine,
    ExplainInDetail,
    Generated,
    StopCodeTransform,
    NewCodeTransform,
}

data class SuggestedFollowUp(
    val type: FollowUpType,
    val pillText: String?,
    val prompt: String?,
    val message: String?,
    val attachedSuggestions: List<Suggestion>?,
)

data class Suggestion(
    val url: String,
    val title: String,
    val body: String,
    val context: List<String>,
    val metadata: SuggestionMetadata?,
    val type: String?,
)

data class SuggestionMetadata(
    val stackOverflow: StackExchangeMetadata?,
    val stackExchange: StackExchangeMetadata?,
)

data class StackExchangeMetadata(
    val answerCount: Long,
    val isAccepted: Boolean,
    val score: Long,
    val lastActivityDate: Long,
)

data class Reference(
    val licenseName: String?,
    val repository: String?,
    val url: String?,
    val recommendationContentSpan: RecommendationContentSpan?
)

data class RecommendationContentSpan(
    val start: Int?,
    val end: Int?
)

data class Header(val sender: String, val responseTo: String, val sequenceId: String)
