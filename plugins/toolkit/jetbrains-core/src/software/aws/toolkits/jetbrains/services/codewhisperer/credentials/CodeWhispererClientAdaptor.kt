// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.services.codewhisperer.CodeWhispererClient
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.ChatInteractWithMessageEvent
import software.amazon.awssdk.services.codewhispererruntime.model.ChatMessageInteractionType
import software.amazon.awssdk.services.codewhispererruntime.model.CompletionType
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.Dimension
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.IdeCategory
import software.amazon.awssdk.services.codewhispererruntime.model.ListAvailableCustomizationsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.ListFeatureEvaluationsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.OperatingSystem
import software.amazon.awssdk.services.codewhispererruntime.model.SendTelemetryEventResponse
import software.amazon.awssdk.services.codewhispererruntime.model.SuggestionState
import software.amazon.awssdk.services.codewhispererruntime.model.UserContext
import software.amazon.awssdk.services.codewhispererruntime.model.UserIntent
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.ResponseContext
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FEATURE_EVALUATION_PRODUCT_NAME
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getTelemetryOptOutPreference
import software.aws.toolkits.jetbrains.services.codewhisperer.util.transform
import software.aws.toolkits.jetbrains.services.telemetry.ClientMetadata
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import software.aws.toolkits.telemetry.CodewhispererSuggestionState
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlin.reflect.KProperty0
import kotlin.reflect.jvm.isAccessible

// TODO: move this file to package "/client"
// As the connection is project-level, we need to make this project-level too
@Deprecated("Methods can throw a NullPointerException if callee does not check if connection is valid")
interface CodeWhispererClientAdaptor : Disposable {
    val project: Project

    fun generateCompletionsPaginator(
        firstRequest: GenerateCompletionsRequest,
    ): Sequence<GenerateCompletionsResponse>

    fun createUploadUrl(
        request: CreateUploadUrlRequest
    ): CreateUploadUrlResponse

    fun createCodeScan(
        request: CreateCodeScanRequest,
        isSigv4: Boolean = shouldUseSigv4Client(project)
    ): CreateCodeScanResponse

    fun getCodeScan(
        request: GetCodeScanRequest,
        isSigv4: Boolean = shouldUseSigv4Client(project)
    ): GetCodeScanResponse

    fun listCodeScanFindings(
        request: ListCodeScanFindingsRequest,
        isSigv4: Boolean = shouldUseSigv4Client(project)
    ): ListCodeScanFindingsResponse

    fun listAvailableCustomizations(): List<CodeWhispererCustomization>

    fun sendUserTriggerDecisionTelemetry(
        requestContext: RequestContext,
        responseContext: ResponseContext,
        completionType: CodewhispererCompletionType,
        suggestionState: CodewhispererSuggestionState,
        suggestionReferenceCount: Int,
        lineCount: Int,
        numberOfRecommendations: Int
    ): SendTelemetryEventResponse

    fun sendCodePercentageTelemetry(
        language: CodeWhispererProgrammingLanguage,
        customizationArn: String?,
        acceptedTokenCount: Int,
        totalTokenCount: Int,
        unmodifiedAcceptedTokenCount: Int?
    ): SendTelemetryEventResponse

    fun sendUserModificationTelemetry(
        sessionId: String,
        requestId: String,
        language: CodeWhispererProgrammingLanguage,
        customizationArn: String,
        modificationPercentage: Double
    ): SendTelemetryEventResponse

    fun sendCodeScanTelemetry(
        language: CodeWhispererProgrammingLanguage,
        codeScanJobId: String?
    ): SendTelemetryEventResponse

    fun sendCodeScanRemediationTelemetry(
        language: CodeWhispererProgrammingLanguage?,
        codeScanRemediationEventType: String?,
        detectorId: String?,
        findingId: String?,
        ruleId: String?,
        component: String?,
        reason: String?,
        result: String?,
        includesFix: Boolean?
    ): SendTelemetryEventResponse
    fun listFeatureEvaluations(): ListFeatureEvaluationsResponse

    fun sendMetricDataTelemetry(eventName: String, metadata: Map<String, Any?>): SendTelemetryEventResponse

    fun sendChatAddMessageTelemetry(
        sessionId: String,
        requestId: String,
        userIntent: UserIntent?,
        hasCodeSnippet: Boolean?,
        programmingLanguage: String?,
        activeEditorTotalCharacters: Int?,
        timeToFirstChunkMilliseconds: Double?,
        timeBetweenChunks: List<Double>?,
        fullResponselatency: Double?,
        requestLength: Int?,
        responseLength: Int?,
        numberOfCodeBlocks: Int?
    ): SendTelemetryEventResponse

    fun sendChatInteractWithMessageTelemetry(
        sessionId: String,
        requestId: String,
        interactionType: ChatMessageInteractionType?,
        interactionTarget: String?,
        acceptedCharacterCount: Int?,
        acceptedSnippetHasReference: Boolean?
    ): SendTelemetryEventResponse

    fun sendChatInteractWithMessageTelemetry(event: ChatInteractWithMessageEvent): SendTelemetryEventResponse

    fun sendChatUserModificationTelemetry(
        sessionId: String,
        requestId: String,
        language: String?,
        modificationPercentage: Double
    ): SendTelemetryEventResponse

    companion object {
        fun getInstance(project: Project): CodeWhispererClientAdaptor = project.service()

        private fun shouldUseSigv4Client(project: Project) =
            CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project) == CodeWhispererLoginType.Accountless

        const val INVALID_CODESCANJOBID = "Invalid_CodeScanJobID"
    }
}

open class CodeWhispererClientAdaptorImpl(override val project: Project) : CodeWhispererClientAdaptor {
    private val codeWhispererUserContext = ClientMetadata().let {
        val osForCodeWhisperer: OperatingSystem =
            when {
                SystemInfo.isWindows -> OperatingSystem.WINDOWS
                SystemInfo.isMac -> OperatingSystem.MAC
                // For now, categorize everything else as "Linux" (Linux/FreeBSD/Solaris/etc)
                else -> OperatingSystem.LINUX
            }

        UserContext.builder()
            .ideCategory(IdeCategory.JETBRAINS)
            .operatingSystem(osForCodeWhisperer)
            .product(FEATURE_EVALUATION_PRODUCT_NAME)
            .clientId(it.clientId)
            .ideVersion(it.productVersion)
            .build()
    }

    private val mySigv4Client by lazy { createUnmanagedSigv4Client() }

    @Volatile
    private var myBearerClient: CodeWhispererRuntimeClient? = null

    private val KProperty0<*>.isLazyInitialized: Boolean
        get() {
            isAccessible = true
            return (getDelegate() as Lazy<*>).isInitialized()
        }

    init {
        initClientUpdateListener()
    }

    private fun initClientUpdateListener() {
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    if (newConnection is AwsBearerTokenConnection) {
                        myBearerClient = getBearerClient(newConnection.getConnectionSettings().providerId)
                    }
                }
            }
        )
    }

    private fun bearerClient(): CodeWhispererRuntimeClient {
        if (myBearerClient != null) return myBearerClient as CodeWhispererRuntimeClient
        myBearerClient = getBearerClient()
        return myBearerClient as CodeWhispererRuntimeClient
    }

    override fun generateCompletionsPaginator(firstRequest: GenerateCompletionsRequest) = sequence<GenerateCompletionsResponse> {
        var nextToken: String? = firstRequest.nextToken()
        do {
            val response = bearerClient().generateCompletions(firstRequest.copy { it.nextToken(nextToken) })
            nextToken = response.nextToken()
            yield(response)
        } while (!nextToken.isNullOrEmpty())
    }

    override fun createUploadUrl(request: CreateUploadUrlRequest): CreateUploadUrlResponse =
        bearerClient().createUploadUrl(request)

    override fun createCodeScan(request: CreateCodeScanRequest, isSigv4: Boolean): CreateCodeScanResponse =
        if (isSigv4) {
            mySigv4Client.createCodeScan(request)
        } else {
            bearerClient().startCodeAnalysis(request.transform()).transform()
        }

    override fun getCodeScan(request: GetCodeScanRequest, isSigv4: Boolean): GetCodeScanResponse =
        if (isSigv4) {
            mySigv4Client.getCodeScan(request)
        } else {
            bearerClient().getCodeAnalysis(request.transform()).transform()
        }

    override fun listCodeScanFindings(request: ListCodeScanFindingsRequest, isSigv4: Boolean): ListCodeScanFindingsResponse =
        if (isSigv4) {
            mySigv4Client.listCodeScanFindings(request)
        } else {
            bearerClient().listCodeAnalysisFindings(request.transform()).transform()
        }

    // DO NOT directly use this method to fetch customizations, use wrapper [CodeWhispererModelConfigurator.listCustomization()] instead
    override fun listAvailableCustomizations(): List<CodeWhispererCustomization> =
        bearerClient().listAvailableCustomizationsPaginator(ListAvailableCustomizationsRequest.builder().build())
            .stream()
            .toList()
            .flatMap { resp ->
                LOG.debug {
                    "listAvailableCustomizations: requestId: ${resp.responseMetadata().requestId()}, customizations: ${
                        resp.customizations().map { it.name() }
                    }"
                }
                resp.customizations().map {
                    CodeWhispererCustomization(
                        arn = it.arn(),
                        name = it.name(),
                        description = it.description()
                    )
                }
            }

    override fun sendUserTriggerDecisionTelemetry(
        requestContext: RequestContext,
        responseContext: ResponseContext,
        completionType: CodewhispererCompletionType,
        suggestionState: CodewhispererSuggestionState,
        suggestionReferenceCount: Int,
        lineCount: Int,
        numberOfRecommendations: Int
    ): SendTelemetryEventResponse {
        val fileContext = requestContext.fileContextInfo
        val programmingLanguage = fileContext.programmingLanguage
        var e2eLatency = requestContext.latencyContext.getCodeWhispererEndToEndLatency()

        // When we send a userTriggerDecision of Empty or Discard, we set the time users see the first
        // suggestion to be now.
        if (e2eLatency < 0) {
            e2eLatency = TimeUnit.NANOSECONDS.toMillis(
                System.nanoTime() - requestContext.latencyContext.codewhispererEndToEndStart
            ).toDouble()
        }
        return bearerClient().sendTelemetryEvent { requestBuilder ->
            requestBuilder.telemetryEvent { telemetryEventBuilder ->
                telemetryEventBuilder.userTriggerDecisionEvent {
                    it.requestId(requestContext.latencyContext.firstRequestId)
                    it.completionType(completionType.toCodeWhispererSdkType())
                    it.programmingLanguage { builder -> builder.languageName(programmingLanguage.toCodeWhispererRuntimeLanguage().languageId) }
                    it.sessionId(responseContext.sessionId)
                    it.recommendationLatencyMilliseconds(e2eLatency)
                    it.triggerToResponseLatencyMilliseconds(requestContext.latencyContext.paginationFirstCompletionTime)
                    it.suggestionState(suggestionState.toCodeWhispererSdkType())
                    it.timestamp(Instant.now())
                    it.suggestionReferenceCount(suggestionReferenceCount)
                    it.generatedLine(lineCount)
                    it.customizationArn(requestContext.customizationArn)
                    it.numberOfRecommendations(numberOfRecommendations)
                }
            }
            requestBuilder.optOutPreference(getTelemetryOptOutPreference())
            requestBuilder.userContext(codeWhispererUserContext)
        }
    }

    override fun sendCodePercentageTelemetry(
        language: CodeWhispererProgrammingLanguage,
        customizationArn: String?,
        acceptedTokenCount: Int,
        totalTokenCount: Int,
        unmodifiedAcceptedTokenCount: Int?
    ): SendTelemetryEventResponse = bearerClient().sendTelemetryEvent { requestBuilder ->
        requestBuilder.telemetryEvent { telemetryEventBuilder ->
            telemetryEventBuilder.codeCoverageEvent {
                it.programmingLanguage { languageBuilder -> languageBuilder.languageName(language.toCodeWhispererRuntimeLanguage().languageId) }
                it.customizationArn(customizationArn)
                it.acceptedCharacterCount(acceptedTokenCount)
                it.totalCharacterCount(totalTokenCount)
                it.timestamp(Instant.now())
                it.unmodifiedAcceptedCharacterCount(unmodifiedAcceptedTokenCount)
            }
        }
        requestBuilder.optOutPreference(getTelemetryOptOutPreference())
        requestBuilder.userContext(codeWhispererUserContext)
    }

    override fun sendUserModificationTelemetry(
        sessionId: String,
        requestId: String,
        language: CodeWhispererProgrammingLanguage,
        customizationArn: String,
        modificationPercentage: Double
    ): SendTelemetryEventResponse = bearerClient().sendTelemetryEvent { requestBuilder ->
        requestBuilder.telemetryEvent { telemetryEventBuilder ->
            telemetryEventBuilder.userModificationEvent {
                it.sessionId(sessionId)
                it.requestId(requestId)
                it.programmingLanguage { languageBuilder ->
                    languageBuilder.languageName(language.toCodeWhispererRuntimeLanguage().languageId)
                }
                it.customizationArn(customizationArn)
                it.modificationPercentage(modificationPercentage)
                it.timestamp(Instant.now())
            }
        }
        requestBuilder.optOutPreference(getTelemetryOptOutPreference())
        requestBuilder.userContext(codeWhispererUserContext)
    }

    override fun sendCodeScanTelemetry(
        language: CodeWhispererProgrammingLanguage,
        codeScanJobId: String?
    ): SendTelemetryEventResponse = bearerClient().sendTelemetryEvent { requestBuilder ->
        requestBuilder.telemetryEvent { telemetryEventBuilder ->
            telemetryEventBuilder.codeScanEvent {
                it.programmingLanguage { languageBuilder ->
                    languageBuilder.languageName(language.toCodeWhispererRuntimeLanguage().languageId)
                }
                it.codeScanJobId(if (codeScanJobId.isNullOrEmpty()) CodeWhispererClientAdaptor.INVALID_CODESCANJOBID else codeScanJobId)
                it.timestamp(Instant.now())
            }
        }
        requestBuilder.optOutPreference(getTelemetryOptOutPreference())
        requestBuilder.userContext(codeWhispererUserContext)
    }
    override fun sendCodeScanRemediationTelemetry(
        language: CodeWhispererProgrammingLanguage?,
        codeScanRemediationEventType: String?,
        detectorId: String?,
        findingId: String?,
        ruleId: String?,
        component: String?,
        reason: String?,
        result: String?,
        includesFix: Boolean?
    ): SendTelemetryEventResponse = bearerClient().sendTelemetryEvent { requestBuilder ->
        requestBuilder.telemetryEvent { telemetryEventBuilder ->
            telemetryEventBuilder.codeScanRemediationsEvent {
                it.programmingLanguage { languageBuilder ->
                    languageBuilder.languageName(language?.toCodeWhispererRuntimeLanguage()?.languageId)
                }
                it.codeScanRemediationsEventType(codeScanRemediationEventType)
                it.detectorId(detectorId)
                it.findingId(findingId)
                it.ruleId(ruleId)
                it.component(component)
                it.reason(reason)
                it.result(result)
                it.includesFix(includesFix)
                it.timestamp(Instant.now())
            }
        }
        requestBuilder.optOutPreference(getTelemetryOptOutPreference())
        requestBuilder.userContext(codeWhispererUserContext)
    }

    override fun listFeatureEvaluations(): ListFeatureEvaluationsResponse = bearerClient().listFeatureEvaluations {
        it.userContext(codeWhispererUserContext)
    }

    override fun sendMetricDataTelemetry(eventName: String, metadata: Map<String, Any?>): SendTelemetryEventResponse =
        bearerClient().sendTelemetryEvent { requestBuilder ->
            requestBuilder.telemetryEvent { telemetryEventBuilder ->
                telemetryEventBuilder.metricData { metricBuilder ->
                    metricBuilder.metricName(eventName)
                    metricBuilder.metricValue(1.0)
                    metricBuilder.timestamp(Instant.now())
                    metricBuilder.dimensions(metadata.filter { it.value != null }.map { Dimension.builder().name(it.key).value(it.value.toString()).build() })
                }
            }
            requestBuilder.optOutPreference(getTelemetryOptOutPreference())
            requestBuilder.userContext(codeWhispererUserContext)
        }

    override fun sendChatAddMessageTelemetry(
        sessionId: String,
        requestId: String,
        userIntent: UserIntent?,
        hasCodeSnippet: Boolean?,
        programmingLanguage: String?,
        activeEditorTotalCharacters: Int?,
        timeToFirstChunkMilliseconds: Double?,
        timeBetweenChunks: List<Double>?,
        fullResponselatency: Double?,
        requestLength: Int?,
        responseLength: Int?,
        numberOfCodeBlocks: Int?
    ): SendTelemetryEventResponse = bearerClient().sendTelemetryEvent { requestBuilder ->
        requestBuilder.telemetryEvent { telemetryEventBuilder ->
            telemetryEventBuilder.chatAddMessageEvent {
                it.conversationId(sessionId)
                it.messageId(requestId)
                it.userIntent(userIntent)
                it.hasCodeSnippet(hasCodeSnippet)
                if (programmingLanguage != null) it.programmingLanguage { langBuilder -> langBuilder.languageName(programmingLanguage) }
                it.activeEditorTotalCharacters(activeEditorTotalCharacters)
                it.timeToFirstChunkMilliseconds(timeToFirstChunkMilliseconds)
                it.timeBetweenChunks(timeBetweenChunks)
                it.fullResponselatency(fullResponselatency)
                it.requestLength(requestLength)
                it.responseLength(responseLength)
                it.numberOfCodeBlocks(numberOfCodeBlocks)
            }
        }
        requestBuilder.optOutPreference(getTelemetryOptOutPreference())
        requestBuilder.userContext(codeWhispererUserContext)
    }

    override fun sendChatInteractWithMessageTelemetry(
        sessionId: String,
        requestId: String,
        interactionType: ChatMessageInteractionType?,
        interactionTarget: String?,
        acceptedCharacterCount: Int?,
        acceptedSnippetHasReference: Boolean?
    ): SendTelemetryEventResponse = sendChatInteractWithMessageTelemetry(
        ChatInteractWithMessageEvent.builder().apply {
            conversationId(sessionId)
            messageId(requestId)
            interactionType(interactionType)
            interactionTarget(interactionTarget)
            acceptedCharacterCount(acceptedCharacterCount)
            acceptedSnippetHasReference(acceptedSnippetHasReference)
        }.build()
    )

    override fun sendChatInteractWithMessageTelemetry(event: ChatInteractWithMessageEvent): SendTelemetryEventResponse =
        bearerClient().sendTelemetryEvent { requestBuilder ->
            requestBuilder.telemetryEvent { telemetryEventBuilder ->
                telemetryEventBuilder.chatInteractWithMessageEvent(event)
            }
            requestBuilder.optOutPreference(getTelemetryOptOutPreference())
            requestBuilder.userContext(codeWhispererUserContext)
        }

    override fun sendChatUserModificationTelemetry(
        sessionId: String,
        requestId: String,
        language: String?,
        modificationPercentage: Double
    ): SendTelemetryEventResponse = bearerClient().sendTelemetryEvent { requestBuilder ->
        requestBuilder.telemetryEvent { telemetryEventBuilder ->
            telemetryEventBuilder.chatUserModificationEvent {
                it.conversationId(sessionId)
                it.messageId(requestId)
                it.programmingLanguage { langBuilder -> langBuilder.languageName(language) }
                it.modificationPercentage(modificationPercentage)
            }
        }
        requestBuilder.optOutPreference(getTelemetryOptOutPreference())
        requestBuilder.userContext(codeWhispererUserContext)
    }

    override fun dispose() {
        if (this::mySigv4Client.isLazyInitialized) {
            mySigv4Client.close()
        }
        myBearerClient?.close()
    }

    /**
     * Every different SSO/AWS Builder ID connection requires a new client which has its corresponding bearer token provider,
     * thus we have to create them dynamically.
     * Invalidate and recycle the old client first, and create a new client with the new connection.
     * This makes sure when we invoke CW, we always use the up-to-date connection.
     * In case this fails to close the client, myBearerClient is already set to null thus next time when we invoke CW,
     * it will go through this again which should get the current up-to-date connection. This stale client would be
     * unused and stay in memory for a while until eventually closed by ToolkitClientManager.
     */
    open fun getBearerClient(oldProviderIdToRemove: String = ""): CodeWhispererRuntimeClient? {
        myBearerClient = null

        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        connection as? AwsBearerTokenConnection ?: run {
            LOG.warn { "$connection is not a bearer token connection" }
            return null
        }

        return AwsClientManager.getInstance().getClient<CodeWhispererRuntimeClient>(connection.getConnectionSettings())
    }

    companion object {
        private val LOG = getLogger<CodeWhispererClientAdaptorImpl>()
        private fun createUnmanagedSigv4Client(): CodeWhispererClient = AwsClientManager.getInstance().createUnmanagedClient(
            AnonymousCredentialsProvider.create(),
            CodeWhispererConstants.Config.Sigv4ClientRegion,
            CodeWhispererConstants.Config.CODEWHISPERER_ENDPOINT
        )
    }
}

class MockCodeWhispererClientAdaptor(override val project: Project) : CodeWhispererClientAdaptorImpl(project) {
    override fun getBearerClient(oldProviderIdToRemove: String): CodeWhispererRuntimeClient = project.awsClient()
    override fun dispose() {}
}

private fun CodewhispererSuggestionState.toCodeWhispererSdkType() = when {
    this == CodewhispererSuggestionState.Accept -> SuggestionState.ACCEPT
    this == CodewhispererSuggestionState.Reject -> SuggestionState.REJECT
    this == CodewhispererSuggestionState.Empty -> SuggestionState.EMPTY
    this == CodewhispererSuggestionState.Discard -> SuggestionState.DISCARD
    else -> SuggestionState.UNKNOWN_TO_SDK_VERSION
}

private fun CodewhispererCompletionType.toCodeWhispererSdkType() = when {
    this == CodewhispererCompletionType.Line -> CompletionType.LINE
    this == CodewhispererCompletionType.Block -> CompletionType.BLOCK
    else -> CompletionType.UNKNOWN_TO_SDK_VERSION
}
