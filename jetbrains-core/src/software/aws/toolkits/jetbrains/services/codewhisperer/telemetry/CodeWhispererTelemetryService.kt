// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.telemetry

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.codewhisperer.model.Recommendation
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CodeScanTelemetryEvent
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.ResponseContext
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getConnectionStartUrl
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.telemetry.CodewhispererLanguage
import software.aws.toolkits.telemetry.CodewhispererSuggestionState
import software.aws.toolkits.telemetry.CodewhispererTelemetry
import software.aws.toolkits.telemetry.CodewhispererTriggerType
import java.time.Instant

class CodeWhispererTelemetryService {
    companion object {
        fun getInstance(): CodeWhispererTelemetryService = service()
        val LOG = getLogger<CodeWhispererTelemetryService>()
    }

    fun sendFailedServiceInvocationEvent(project: Project, exceptionType: String?) {
        CodewhispererTelemetry.serviceInvocation(
            project = project,
            codewhispererCursorOffset = 0,
            codewhispererLanguage = CodewhispererLanguage.Unknown,
            codewhispererLastSuggestionIndex = -1,
            codewhispererLineNumber = 0,
            codewhispererTriggerType = CodewhispererTriggerType.Unknown,
            duration = 0.0,
            reason = exceptionType,
            success = false
        )
    }

    fun sendServiceInvocationEvent(
        requestId: String,
        requestContext: RequestContext,
        responseContext: ResponseContext,
        lastRecommendationIndex: Int,
        invocationSuccess: Boolean,
        latency: Double,
        exceptionType: String?
    ) {
        val (project, _, triggerTypeInfo, caretPosition) = requestContext
        val (triggerType, automatedTriggerType) = triggerTypeInfo
        val (offset, line) = caretPosition
        val codewhispererLanguage = requestContext.fileContextInfo.programmingLanguage.toTelemetryType()
        val startUrl = getConnectionStartUrl(requestContext.connection)
        CodewhispererTelemetry.serviceInvocation(
            project = project,
            codewhispererAutomatedTriggerType = automatedTriggerType,
            codewhispererCompletionType = responseContext.completionType,
            codewhispererCursorOffset = offset,
            codewhispererLanguage = codewhispererLanguage,
            codewhispererLastSuggestionIndex = lastRecommendationIndex,
            codewhispererLineNumber = line,
            codewhispererRequestId = requestId,
            codewhispererSessionId = responseContext.sessionId,
            codewhispererTriggerType = triggerType,
            duration = latency,
            reason = exceptionType,
            success = invocationSuccess,
            credentialStartUrl = startUrl
        )
    }

    fun sendUserDecisionEvent(
        requestId: String,
        requestContext: RequestContext,
        responseContext: ResponseContext,
        detail: Recommendation,
        index: Int,
        suggestionState: CodewhispererSuggestionState,
        numOfRecommendations: Int
    ) {
        val (project, _, triggerTypeInfo) = requestContext
        val codewhispererLanguage = requestContext.fileContextInfo.programmingLanguage.toTelemetryType()

        LOG.debug {
            "Recording user decisions of recommendation. " +
                "Index: $index, " +
                "State: $suggestionState, " +
                "Request ID: $requestId, " +
                "Recommendation: ${detail.content()}"
        }
        val startUrl = getConnectionStartUrl(requestContext.connection)
        CodewhispererTelemetry.userDecision(
            project = project,
            codewhispererCompletionType = responseContext.completionType,
            codewhispererLanguage = codewhispererLanguage,
            codewhispererPaginationProgress = numOfRecommendations,
            codewhispererRequestId = requestId,
            codewhispererSessionId = responseContext.sessionId,
            codewhispererSuggestionIndex = index,
            codewhispererSuggestionReferenceCount = detail.references().size,
            codewhispererSuggestionReferences = jacksonObjectMapper().writeValueAsString(detail.references().map { it.licenseName() }.toSet().toList()),
            codewhispererSuggestionState = suggestionState,
            codewhispererTriggerType = triggerTypeInfo.triggerType,
            credentialStartUrl = startUrl
        )
    }

    fun sendSecurityScanEvent(codeScanEvent: CodeScanTelemetryEvent, project: Project? = null) {
        val (payloadContext, serviceInvocationContext, codeScanJobId, totalIssues, reason) = codeScanEvent.codeScanResponseContext
        val startUrl = getConnectionStartUrl(codeScanEvent.connection)

        LOG.debug {
            "Recording code security scan event. \n" +
                "Total number of security scan issues found: $totalIssues, \n" +
                "Language: ${payloadContext.language}, \n" +
                "Uncompressed source payload size in bytes: ${payloadContext.srcPayloadSize}, \n" +
                "Uncompressed build payload size in bytes: ${payloadContext.buildPayloadSize}, \n" +
                "Compressed source zip file size in bytes: ${payloadContext.srcZipFileSize}, \n" +
                "Compressed build zip file size in bytes: ${payloadContext.buildZipFileSize}, \n" +
                "Total project size in bytes: ${codeScanEvent.totalProjectSizeInBytes}, \n" +
                "Total duration of the security scan job in milliseconds: ${codeScanEvent.duration}, \n" +
                "Context truncation duration in milliseconds: ${payloadContext.totalTimeInMilliseconds}, \n" +
                "Artifacts upload duration in milliseconds: ${serviceInvocationContext.artifactsUploadDuration}, \n" +
                "Service invocation duration in milliseconds: ${serviceInvocationContext.serviceInvocationDuration}, \n" +
                "Total number of lines scanned: ${payloadContext.totalLines}, \n" +
                "Reason: $reason \n"
        }
        CodewhispererTelemetry.securityScan(
            project = project,
            codewhispererCodeScanLines = payloadContext.totalLines.toInt(),
            codewhispererCodeScanJobId = codeScanJobId,
            codewhispererCodeScanProjectBytes = codeScanEvent.totalProjectSizeInBytes,
            codewhispererCodeScanSrcPayloadBytes = payloadContext.srcPayloadSize.toInt(),
            codewhispererCodeScanBuildPayloadBytes = payloadContext.buildPayloadSize?.toInt(),
            codewhispererCodeScanSrcZipFileBytes = payloadContext.srcZipFileSize.toInt(),
            codewhispererCodeScanBuildZipFileBytes = payloadContext.buildZipFileSize?.toInt(),
            codewhispererCodeScanTotalIssues = totalIssues,
            codewhispererLanguage = payloadContext.language,
            duration = codeScanEvent.duration,
            contextTruncationDuration = payloadContext.totalTimeInMilliseconds.toInt(),
            artifactsUploadDuration = serviceInvocationContext.artifactsUploadDuration.toInt(),
            codeScanServiceInvocationsDuration = serviceInvocationContext.serviceInvocationDuration.toInt(),
            reason = reason,
            result = codeScanEvent.result,
            credentialStartUrl = startUrl
        )
    }

    fun enqueueAcceptedSuggestionEntry(
        requestId: String,
        requestContext: RequestContext,
        responseContext: ResponseContext,
        time: Instant,
        vFile: VirtualFile?,
        range: RangeMarker,
        suggestion: String,
        selectedIndex: Int
    ) {
        val (sessionId, completionType) = responseContext
        val codewhispererLanguage = requestContext.fileContextInfo.programmingLanguage.toTelemetryType()
        CodeWhispererUserModificationTracker.getInstance(requestContext.project).enqueue(
            AcceptedSuggestionEntry(
                time, vFile, range, suggestion, sessionId, requestId, selectedIndex,
                requestContext.triggerTypeInfo.triggerType, completionType,
                codewhispererLanguage, null, null,
                requestContext.connection
            )
        )
    }

    fun sendUserDecisionEventForAll(
        requestContext: RequestContext,
        responseContext: ResponseContext,
        recommendationContext: RecommendationContext,
        sessionContext: SessionContext,
        hasUserAccepted: Boolean,
    ) {
        val detailContexts = recommendationContext.details
        detailContexts.forEachIndexed { index, detailContext ->
            val (requestId, detail, _, isDiscarded) = detailContext
            val suggestionState = recordSuggestionState(
                index,
                sessionContext.selectedIndex,
                sessionContext.seen.contains(index),
                hasUserAccepted,
                isDiscarded,
                detail.content().isEmpty()
            )
            sendUserDecisionEvent(requestId, requestContext, responseContext, detail, index, suggestionState, detailContexts.size)
        }
    }

    fun sendPerceivedLatencyEvent(
        requestId: String,
        requestContext: RequestContext,
        responseContext: ResponseContext,
        latency: Double,
    ) {
        val (project, _, triggerTypeInfo) = requestContext
        val codewhispererLanguage = requestContext.fileContextInfo.programmingLanguage.toTelemetryType()
        val startUrl = getConnectionStartUrl(requestContext.connection)
        CodewhispererTelemetry.perceivedLatency(
            project = project,
            codewhispererCompletionType = responseContext.completionType,
            codewhispererLanguage = codewhispererLanguage,
            codewhispererRequestId = requestId,
            codewhispererSessionId = responseContext.sessionId,
            codewhispererTriggerType = triggerTypeInfo.triggerType,
            duration = latency,
            passive = true,
            credentialStartUrl = startUrl
        )
    }

    private fun recordSuggestionState(
        index: Int,
        selectedIndex: Int,
        hasSeen: Boolean,
        hasUserAccepted: Boolean,
        isDiscarded: Boolean,
        isEmpty: Boolean
    ): CodewhispererSuggestionState =
        if (isEmpty) {
            CodewhispererSuggestionState.Empty
        } else if (isDiscarded) {
            CodewhispererSuggestionState.Discard
        } else if (!hasSeen) {
            CodewhispererSuggestionState.Unseen
        } else if (hasUserAccepted) {
            if (selectedIndex == index) {
                CodewhispererSuggestionState.Accept
            } else {
                CodewhispererSuggestionState.Ignore
            }
        } else {
            CodewhispererSuggestionState.Reject
        }
}

fun isTelemetryEnabled(): Boolean = AwsSettings.getInstance().isTelemetryEnabled
