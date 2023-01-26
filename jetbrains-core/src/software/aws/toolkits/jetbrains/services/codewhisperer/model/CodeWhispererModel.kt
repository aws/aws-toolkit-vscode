// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.model

import com.intellij.openapi.Disposable
import com.intellij.openapi.editor.VisualPosition
import com.intellij.openapi.ui.popup.JBPopup
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsResponse
import software.amazon.awssdk.services.codewhisperer.model.Recommendation
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.PayloadContext
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.ResponseContext
import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType
import software.aws.toolkits.telemetry.CodewhispererTriggerType
import software.aws.toolkits.telemetry.Result
import java.util.concurrent.TimeUnit

data class CaretContext(val leftFileContext: String, val rightFileContext: String, val leftContextOnCurrentLine: String = "")

data class FileContextInfo(
    val caretContext: CaretContext,
    val filename: String,
    val programmingLanguage: CodeWhispererProgrammingLanguage
)
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
    val isDiscarded: Boolean,
    val isTruncatedOnRight: Boolean
)

data class SessionContext(
    val typeahead: String = "",
    val typeaheadOriginal: String = "",
    val selectedIndex: Int = 0,
    val seen: MutableSet<Int> = mutableSetOf(),
    val isFirstTimeShowingPopup: Boolean = true
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
    val result: Result,
    val totalProjectSizeInBytes: Double?,
    val connection: ToolkitConnection?
)

data class CodeScanServiceInvocationContext(
    val artifactsUploadDuration: Long,
    val serviceInvocationDuration: Long
)

data class CodeScanResponseContext(
    val payloadContext: PayloadContext,
    val serviceInvocationContext: CodeScanServiceInvocationContext,
    val codeScanJobId: String? = null,
    val codeScanTotalIssues: Int = 0,
    val reason: String? = null
)
data class LatencyContext(
    var credentialFetchingStart: Long = 0L,
    var credentialFetchingEnd: Long = 0L,

    var codewhispererPreprocessingStart: Long = 0L,
    var codewhispererPreprocessingEnd: Long = 0L,

    var paginationFirstCompletionTime: Double = 0.0,

    var codewhispererPostprocessingStart: Long = 0L,
    var codewhispererPostprocessingEnd: Long = 0L,

    var codewhispererEndToEndStart: Long = 0L,
    var codewhispererEndToEndEnd: Long = 0L,

    var paginationAllCompletionsStart: Long = 0L,
    var paginationAllCompletionsEnd: Long = 0L,

    var firstRequestId: String = ""
) {
    fun getCodeWhispererEndToEndLatency() = TimeUnit.NANOSECONDS.toMillis(
        codewhispererEndToEndEnd - codewhispererEndToEndStart
    ).toDouble()

    fun getCodeWhispererAllCompletionsLatency() = TimeUnit.NANOSECONDS.toMillis(
        paginationAllCompletionsEnd - paginationAllCompletionsStart
    ).toDouble()

    fun getCodeWhispererPostprocessingLatency() = TimeUnit.NANOSECONDS.toMillis(
        codewhispererPostprocessingEnd - codewhispererPostprocessingStart
    ).toDouble()

    fun getCodeWhispererCredentialFetchingLatency() = TimeUnit.NANOSECONDS.toMillis(
        credentialFetchingEnd - credentialFetchingStart
    ).toDouble()

    fun getCodeWhispererPreprocessingLatency() = TimeUnit.NANOSECONDS.toMillis(
        codewhispererPreprocessingEnd - codewhispererPreprocessingStart
    ).toDouble()
}
