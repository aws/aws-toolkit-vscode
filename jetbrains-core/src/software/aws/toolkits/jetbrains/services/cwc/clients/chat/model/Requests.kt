// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.clients.chat.model

import com.fasterxml.jackson.annotation.JsonProperty
import software.amazon.awssdk.services.codewhispererstreaming.model.UserIntent
import software.aws.toolkits.jetbrains.services.cwc.editor.context.ActiveFileContext

enum class TriggerType {
    Click,
    ContextMenu,
    Hotkeys
}

data class ChatRequestData(
    val tabId: String,
    val message: String,
    val activeFileContext: ActiveFileContext,
    val userIntent: UserIntent?,
    val triggerType: TriggerType
)

interface CodeNames {
    val simpleNames: List<String>?

    // TODO switch to FullyQualifiedNames in new API
    val fullyQualifiedNames: FullyQualifiedNames?
}

// TODO(kylechen): confirm if mutable is needed
// NOTE: MatchPolicy was originally QueryContext in old code
data class MatchPolicy(
    val must: Set<String> = emptySet(),
    val should: Set<String> = emptySet(),
    val mustNot: Set<String> = emptySet(),
) {
    fun withMust(m: String) = copy(must = must + m)
    fun withShould(s: String) = copy(should = should + s)
    fun withMustNot(mn: String) = copy(mustNot = mustNot + mn)
}

data class Context(
    val matchPolicy: MatchPolicy?,
)

data class FullyQualifiedNames(
    val used: List<FullyQualifiedName>?,
)
data class FullyQualifiedName(
    val source: List<String>?,
    val symbol: List<String>?,
)

data class CodeNamesImpl(
    @JsonProperty("simpleNames") override val simpleNames: List<String>?,
    @JsonProperty("fullyQualifiedNames") override val fullyQualifiedNames: FullyQualifiedNames?,
) : CodeNames
