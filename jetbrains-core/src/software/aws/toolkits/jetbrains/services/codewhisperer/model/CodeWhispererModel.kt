// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.model

import com.intellij.openapi.Disposable
import com.intellij.openapi.editor.VisualPosition
import com.intellij.openapi.ui.popup.JBPopup
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsResponse
import software.amazon.awssdk.services.codewhisperer.model.Recommendation
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.ResponseContext
import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType
import software.aws.toolkits.telemetry.CodewhispererLanguage
import software.aws.toolkits.telemetry.CodewhispererTriggerType
import software.aws.toolkits.telemetry.Result

data class CaretContext(val leftFileContext: String, val rightFileContext: String, val leftContextOnCurrentLine: String = "")

data class FileContextInfo(
    val caretContext: CaretContext,
    val filename: String,
    val programmingLanguage: ProgrammingLanguage
)

data class ProgrammingLanguage(val languageName: String)

data class RecommendationContext(
    val details: List<DetailContext>,
    val userInputOriginal: String,
    val userInputSinceInvocation: String,
    val position: VisualPosition
)

data class DetailContext(
    val requestId: String,
    val recommendation: Recommendation,
    val reformatted: Recommendation,
    val isDiscarded: Boolean
)

data class SessionContext(
    val typeahead: String = "",
    val typeaheadOriginal: String = "",
    val selectedIndex: Int = 0,
    val seen: MutableSet<Int> = mutableSetOf()
)

data class RecommendationChunk(
    val text: String,
    val offset: Int,
    val inlayOffset: Int
)

data class CaretPosition(val offset: Int, val line: Int)

data class TriggerTypeInfo(val triggerType: CodewhispererTriggerType, val automatedTriggerType: CodewhispererAutomatedTriggerType)

data class InvocationContext(
    val requestContext: RequestContext,
    val responseContext: ResponseContext,
    val recommendationContext: RecommendationContext,
    val popup: JBPopup
) : Disposable {
    override fun dispose() {}
}

data class WorkerContext(
    val requestContext: RequestContext,
    val responseContext: ResponseContext,
    val response: ListRecommendationsResponse,
    val popup: JBPopup
)

data class CodeScanTelemetryEvent(
    val codeScanResponseContext: CodeScanResponseContext,
    val duration: Double,
    val result: Result
)

data class CodeScanResponseContext(
    val codeScanJobId: String? = null,
    val codewhispererLanguage: CodewhispererLanguage = CodewhispererLanguage.Unknown,
    val payloadSizeInBytes: Long = 0L,
    val codeScanLines: Long = 0L,
    val codeScanTotalIssues: Int = 0,
    val reason: String? = null
)
