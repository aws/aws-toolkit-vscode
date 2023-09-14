// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.VisualPosition
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.Import
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.MockCodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CaretContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CaretPosition
import software.aws.toolkits.jetbrains.services.codewhisperer.model.Chunk
import software.aws.toolkits.jetbrains.services.codewhisperer.model.DetailContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.FileContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SupplementalContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutomatedTriggerType
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroup
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupStates
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.ResponseContext
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTelemetryService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CrossFileStrategy
import software.aws.toolkits.jetbrains.services.codewhisperer.util.UtgStrategy
import software.aws.toolkits.jetbrains.services.telemetry.NoOpPublisher
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import software.aws.toolkits.telemetry.CodewhispererPreviousSuggestionState
import software.aws.toolkits.telemetry.CodewhispererSuggestionState
import software.aws.toolkits.telemetry.CodewhispererTriggerType
import java.time.Duration
import kotlin.random.Random

// TODO: add more tests
class CodeWhispererTelemetryServiceTest {
    private class NoOpToolkitTelemetryService(
        publisher: TelemetryPublisher = NoOpPublisher(),
        batcher: TelemetryBatcher
    ) : TelemetryService(publisher, batcher)

    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private lateinit var sut: CodeWhispererTelemetryService
    private lateinit var telemetryServiceSpy: TelemetryService
    private lateinit var batcher: TelemetryBatcher

    @Before
    fun setup() {
        AwsSettings.getInstance().isTelemetryEnabled = true

        sut = spy(CodeWhispererTelemetryService.getInstance())

        batcher = mock()

        telemetryServiceSpy = NoOpToolkitTelemetryService(batcher = batcher)
        ApplicationManager.getApplication().replaceService(TelemetryService::class.java, telemetryServiceSpy, disposableRule.disposable)

        val groupSettings = CodeWhispererUserGroupSettings().apply {
            loadState(
                CodeWhispererUserGroupStates(
                    version = AwsToolkit.PLUGIN_VERSION,
                    settings = mapOf(CodeWhispererUserGroupSettings.USER_GROUP_KEY to CodeWhispererUserGroup.Control.name)
                )
            )
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererUserGroupSettings::class.java, groupSettings, disposableRule.disposable)
    }

    @After
    fun cleanup() {
        sut.previousDecisions().clear()
    }

    @Test
    fun `test recordSuggestionState`() {
        fun assertSuggestionStates(expectedStates: List<CodewhispererSuggestionState>) {
            val (recommendationContext, sessionContext) = aRecommendationContextAndSessionContext(expectedStates)
            val hasUserAccepted = expectedStates.any { it == CodewhispererSuggestionState.Accept }

            val details = recommendationContext.details
            val actualStates = mutableListOf<CodewhispererSuggestionState>()
            details.forEachIndexed { index, detail ->
                val suggestionState = sut.recordSuggestionState(
                    index,
                    sessionContext.selectedIndex,
                    sessionContext.seen.contains(index),
                    hasUserAccepted,
                    detail.isDiscarded,
                    detail.recommendation.content().isEmpty()
                )
                actualStates.add(suggestionState)
            }

            assertThat(actualStates).hasSize(expectedStates.size)
            actualStates.forEachIndexed { i, actual ->
                assertThat(actual).isEqualTo(expectedStates[i])
            }
        }

        assertSuggestionStates(listOf(CodewhispererSuggestionState.Ignore, CodewhispererSuggestionState.Ignore, CodewhispererSuggestionState.Accept))
        assertSuggestionStates(
            listOf(
                CodewhispererSuggestionState.Reject,
                CodewhispererSuggestionState.Reject,
                CodewhispererSuggestionState.Discard,
                CodewhispererSuggestionState.Unseen
            )
        )
        assertSuggestionStates(listOf(CodewhispererSuggestionState.Empty, CodewhispererSuggestionState.Empty, CodewhispererSuggestionState.Empty))
        assertSuggestionStates(
            listOf(
                CodewhispererSuggestionState.Reject,
                CodewhispererSuggestionState.Unseen,
                CodewhispererSuggestionState.Unseen,
                CodewhispererSuggestionState.Discard
            )
        )
        assertSuggestionStates(
            listOf(
                CodewhispererSuggestionState.Ignore,
                CodewhispererSuggestionState.Accept,
                CodewhispererSuggestionState.Ignore,
                CodewhispererSuggestionState.Unseen,
                CodewhispererSuggestionState.Unseen
            )
        )
    }

    @Test
    fun `test aggregateUserDecision`() {
        fun assertAggregateUserDecision(decisions: List<CodewhispererSuggestionState>, expected: CodewhispererPreviousSuggestionState) {
            val actual = sut.aggregateUserDecision(decisions)
            assertThat(actual).isEqualTo(expected)
        }

        assertAggregateUserDecision(
            listOf(
                CodewhispererSuggestionState.Accept,
                CodewhispererSuggestionState.Ignore,
                CodewhispererSuggestionState.Ignore,
                CodewhispererSuggestionState.Unseen,
                CodewhispererSuggestionState.Unseen
            ),
            CodewhispererPreviousSuggestionState.Accept
        )

        assertAggregateUserDecision(
            listOf(
                CodewhispererSuggestionState.Discard,
                CodewhispererSuggestionState.Discard,
                CodewhispererSuggestionState.Reject,
                CodewhispererSuggestionState.Empty,
                CodewhispererSuggestionState.Ignore
            ),
            CodewhispererPreviousSuggestionState.Reject
        )

        assertAggregateUserDecision(
            listOf(
                CodewhispererSuggestionState.Discard,
                CodewhispererSuggestionState.Empty,
                CodewhispererSuggestionState.Discard,
                CodewhispererSuggestionState.Discard,
                CodewhispererSuggestionState.Empty
            ),
            CodewhispererPreviousSuggestionState.Discard
        )

        assertAggregateUserDecision(
            listOf(
                CodewhispererSuggestionState.Empty,
                CodewhispererSuggestionState.Empty,
                CodewhispererSuggestionState.Empty,
                CodewhispererSuggestionState.Empty
            ),
            CodewhispererPreviousSuggestionState.Empty
        )
    }

    @Test
    fun `sendUserTriggerDecisionEvent`() {
        val timeSinceDocumentChanged = Random.nextDouble(0.0, 1000.0)
        val mockCodeWhispererInvocationStatus: CodeWhispererInvocationStatus = mock {
            on { getTimeSinceDocumentChanged() }.thenReturn(timeSinceDocumentChanged)
        }

        ApplicationManager.getApplication().replaceService(
            CodeWhispererInvocationStatus::class.java,
            mockCodeWhispererInvocationStatus,
            disposableRule.disposable
        )

        val supplementalContextInfo = aSupplementalContextInfo()
        val requestContext = aRequestContext(projectRule.project, mySupplementalContextInfo = supplementalContextInfo)
        val responseContext = aResponseContext()
        val recommendationContext = aRecommendationContext()
        val popupShownDuration = Duration.ofSeconds(Random.nextLong(0, 30))
        val suggestionState = CodewhispererSuggestionState.Reject
        val suggestionReferenceCount = Random.nextInt(2)
        val lineCount = Random.nextInt(0, 100)

        val expectedTotalImportCount = recommendationContext.details.fold(0) { grandTotal, detail ->
            grandTotal + detail.recommendation.mostRelevantMissingImports().size
        }

        sut.sendUserTriggerDecisionEvent(
            requestContext,
            responseContext,
            recommendationContext,
            suggestionState,
            popupShownDuration,
            suggestionReferenceCount,
            lineCount
        )

        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            CodeWhispererTelemetryTest.assertEventsContainsFieldsAndCount(
                allValues,
                "codewhisperer_userTriggerDecision",
                1,
                "codewhispererSessionId" to responseContext.sessionId,
                "codewhispererFirstRequestId" to requestContext.latencyContext.firstRequestId,
                "codewhispererCompletionType" to CodewhispererCompletionType.Line,
                "codewhispererLanguage" to requestContext.fileContextInfo.programmingLanguage.toTelemetryType(),
                "codewhispererTriggerType" to requestContext.triggerTypeInfo.triggerType,
                "codewhispererAutomatedTriggerType" to requestContext.triggerTypeInfo.automatedTriggerType.telemetryType,
                "codewhispererLineNumber" to requestContext.caretPosition.line,
                "codewhispererCursorOffset" to requestContext.caretPosition.offset,
                "codewhispererSuggestionCount" to recommendationContext.details.size,
                "codewhispererSuggestionImportCount" to expectedTotalImportCount,
                "codewhispererTotalShownTime" to popupShownDuration?.toMillis()?.toDouble(),
                "codewhispererTriggerCharacter" to requestContext.triggerTypeInfo.automatedTriggerType.let {
                    if (it is CodeWhispererAutomatedTriggerType.SpecialChar) {
                        it.specialChar.toString()
                    } else {
                        null
                    }
                },
                "codewhispererTypeaheadLength" to recommendationContext.userInputSinceInvocation.length,
                "codewhispererTimeSinceLastDocumentChange" to timeSinceDocumentChanged,
                "codewhispererUserGroup" to "Control",
                "codewhispererSupplementalContextTimeout" to supplementalContextInfo.isProcessTimeout,
                "codewhispererSupplementalContextIsUtg" to supplementalContextInfo.isUtg,
                "codewhispererSupplementalContextLength" to supplementalContextInfo.contentLength
            )
        }
    }

    @Test
    fun `sendUserDecisionEventForAll will send userDecision event for all suggestions`() {
        doNothing().whenever(sut).sendUserTriggerDecisionEvent(any(), any(), any(), any(), any(), any(), any())
        val eventCount = mutableMapOf<CodewhispererSuggestionState, Int>()
        var totalEventCount = 0
        val requestContext = aRequestContext(projectRule.project)
        val responseContext = aResponseContext()

        fun assertUserDecision(decisions: List<CodewhispererSuggestionState>) {
            decisions.forEach { eventCount[it] = 1 + (eventCount[it] ?: 0) }
            totalEventCount += decisions.size

            val (recommendationContext, sessionContext) = aRecommendationContextAndSessionContext(decisions)
            val hasUserAccept = decisions.any { it == CodewhispererSuggestionState.Accept }
            val popupShownDuration = Duration.ofSeconds(Random.nextLong(0, 30))

            sut.sendUserDecisionEventForAll(requestContext, responseContext, recommendationContext, sessionContext, hasUserAccept, popupShownDuration)
            argumentCaptor<MetricEvent>().apply {
                verify(batcher, atLeastOnce()).enqueue(capture())

                CodeWhispererTelemetryTest.assertEventsContainsFieldsAndCount(
                    allValues,
                    "codewhisperer_userDecision",
                    count = totalEventCount,
                    "codewhispererUserGroup" to "Control",
                )

                eventCount.forEach { (k, v) ->
                    CodeWhispererTelemetryTest.assertEventsContainsFieldsAndCount(
                        allValues,
                        "codewhisperer_userDecision",
                        count = v,
                        "codewhispererSuggestionState" to k
                    )
                }
            }
        }

        assertUserDecision(
            listOf(
                CodewhispererSuggestionState.Accept,
                CodewhispererSuggestionState.Ignore,
                CodewhispererSuggestionState.Ignore,
                CodewhispererSuggestionState.Unseen
            )
        )

        assertUserDecision(
            listOf(
                CodewhispererSuggestionState.Reject,
                CodewhispererSuggestionState.Reject,
                CodewhispererSuggestionState.Unseen,
                CodewhispererSuggestionState.Unseen
            ),
        )

        assertUserDecision(
            listOf(
                CodewhispererSuggestionState.Empty,
                CodewhispererSuggestionState.Empty,
                CodewhispererSuggestionState.Empty
            ),
        )
    }

    @Test
    fun `sendUserDecisionEventForAll will aggregate suggestion level decisions and send out userTriggerDecision`() {
        fun helper(
            decisions: List<CodewhispererSuggestionState>,
            expectedState: CodewhispererSuggestionState,
            expectedPreviousSuggestionState: CodewhispererPreviousSuggestionState?
        ) {
            val supplementalContextInfo = aSupplementalContextInfo()
            val requestContext = aRequestContext(projectRule.project, mySupplementalContextInfo = supplementalContextInfo)
            val responseContext = aResponseContext()
            val (recommendationContext, sessionContext) = aRecommendationContextAndSessionContext(decisions)
            val hasUserAccept = decisions.any { it == CodewhispererSuggestionState.Accept }
            val popupShownDuration = Duration.ofSeconds(Random.nextLong(0, 30))

            sut.sendUserDecisionEventForAll(requestContext, responseContext, recommendationContext, sessionContext, hasUserAccept, popupShownDuration)
            argumentCaptor<MetricEvent>().apply {
                verify(batcher, atLeastOnce()).enqueue(capture())

                CodeWhispererTelemetryTest.assertEventsContainsFieldsAndCount(
                    allValues,
                    "codewhisperer_userTriggerDecision",
                    count = 1,
                    "codewhispererSuggestionState" to expectedState,
                    "codewhispererUserGroup" to "Control",
                    "codewhispererSupplementalContextTimeout" to supplementalContextInfo.isProcessTimeout,
                    "codewhispererSupplementalContextIsUtg" to supplementalContextInfo.isUtg,
                    "codewhispererSupplementalContextLength" to supplementalContextInfo.contentLength,
                    atLeast = true
                )

                CodeWhispererTelemetryTest.assertEventsContainsFieldsAndCount(
                    allValues,
                    "codewhisperer_userTriggerDecision",
                    count = 1,
                    "codewhispererPreviousSuggestionState" to expectedPreviousSuggestionState,
                    "codewhispererSupplementalContextTimeout" to supplementalContextInfo.isProcessTimeout,
                    "codewhispererSupplementalContextIsUtg" to supplementalContextInfo.isUtg,
                    "codewhispererSupplementalContextLength" to supplementalContextInfo.contentLength,
                    "codewhispererUserGroup" to "Control",
                    atLeast = true
                )
            }
        }

        val decisionQueue = sut.previousDecisions()
        assertThat(decisionQueue).isEmpty()

        helper(
            listOf(
                CodewhispererSuggestionState.Accept,
                CodewhispererSuggestionState.Ignore,
                CodewhispererSuggestionState.Ignore,
                CodewhispererSuggestionState.Unseen
            ),
            CodewhispererSuggestionState.Accept,
            null
        )
        assertThat(decisionQueue).hasSize(1)

        helper(
            listOf(
                CodewhispererSuggestionState.Reject,
                CodewhispererSuggestionState.Reject,
                CodewhispererSuggestionState.Unseen,
                CodewhispererSuggestionState.Unseen
            ),
            CodewhispererSuggestionState.Reject,
            CodewhispererPreviousSuggestionState.Accept
        )
        assertThat(decisionQueue).hasSize(2)

        helper(
            listOf(
                CodewhispererSuggestionState.Empty,
                CodewhispererSuggestionState.Empty,
                CodewhispererSuggestionState.Empty
            ),
            CodewhispererSuggestionState.Empty,
            CodewhispererPreviousSuggestionState.Reject
        )
        assertThat(decisionQueue).hasSize(3)
    }

    @Test
    fun `should invoke putTelemetryEvent when sending userTriggerDecision for pro tier users and optin data sharing`() {
        val project = projectRule.project

        val mockClient = spy(MockCodeWhispererClientAdaptor(project))
        project.replaceService(
            CodeWhispererClientAdaptor::class.java,
            mockClient,
            disposableRule.disposable
        )

        ApplicationManager.getApplication().replaceService(
            CodeWhispererExplorerActionManager::class.java,
            mock { on { checkActiveCodeWhispererConnectionType(any()) } doReturn CodeWhispererLoginType.SSO },
            disposableRule.disposable
        )

        AwsSettings.getInstance().isTelemetryEnabled = true

        val mockSsoConnection = mock<ManagedBearerSsoConnection> {
            on { this.startUrl } doReturn "fake sso url"
        }

        project.replaceService(
            ToolkitConnectionManager::class.java,
            mock { on { activeConnectionForFeature(eq(CodeWhispererConnection.getInstance())) } doReturn mockSsoConnection },
            disposableRule.disposable
        )
        assertThat(AwsSettings.getInstance().isTelemetryEnabled).isTrue

        val requestContext = aRequestContext(project)
        val responseContext = aResponseContext()
        val recommendationContext = aRecommendationContext()
        val suggestionState = CodewhispererSuggestionState.Accept
        val duration = Duration.ofSeconds(1)
        val suggestionReferenceCount = 1
        val lineCount = 30

        sut.sendUserTriggerDecisionEvent(
            requestContext,
            responseContext,
            recommendationContext,
            suggestionState,
            duration,
            suggestionReferenceCount,
            lineCount
        )

        val completionType = if (recommendationContext.details.any {
                it.completionType == CodewhispererCompletionType.Block
            }
        ) {
            CodewhispererCompletionType.Block
        } else CodewhispererCompletionType.Line

        verify(mockClient).putUserTriggerDecisionTelemetry(
            eq(requestContext),
            eq(responseContext),
            eq(completionType),
            eq(suggestionState),
            eq(suggestionReferenceCount),
            eq(lineCount),
        )
    }

    @Test
    fun `should not invoke putTelemetryEvent if opt out telemetry`() {
        val project = projectRule.project

        val mockClient = mock<CodeWhispererClientAdaptor>()
        project.replaceService(
            CodeWhispererClientAdaptor::class.java,
            mockClient,
            disposableRule.disposable
        )

        val mockStatesManager = mock<CodeWhispererExplorerActionManager>()
        ApplicationManager.getApplication().replaceService(
            CodeWhispererExplorerActionManager::class.java,
            mockStatesManager,
            disposableRule.disposable
        )

        fun configureMock(isProTier: Boolean, isTelemetryEnabled: Boolean) {
            if (isProTier) {
                whenever(mockStatesManager.checkActiveCodeWhispererConnectionType(any())).doReturn(CodeWhispererLoginType.SSO)
            } else {
                whenever(mockStatesManager.checkActiveCodeWhispererConnectionType(any())).doReturn(CodeWhispererLoginType.Sono)
            }

            AwsSettings.getInstance().isTelemetryEnabled = isTelemetryEnabled
        }

        // case 1
        configureMock(isProTier = true, isTelemetryEnabled = false)
        sut.sendUserTriggerDecisionEvent(
            aRequestContext(project),
            aResponseContext(),
            aRecommendationContext(),
            CodewhispererSuggestionState.Accept,
            Duration.ofSeconds(
                1
            ),
            1,
            50
        )

        verifyNoInteractions(mockClient)

        // case 2
        configureMock(isProTier = false, isTelemetryEnabled = true)
        sut.sendUserTriggerDecisionEvent(
            aRequestContext(project),
            aResponseContext(),
            aRecommendationContext(),
            CodewhispererSuggestionState.Accept,
            Duration.ofSeconds(
                1
            ),
            1,
            50,
        )

        verifyNoInteractions(mockClient)

        // case 3
        configureMock(isProTier = false, isTelemetryEnabled = false)
        sut.sendUserTriggerDecisionEvent(
            aRequestContext(project),
            aResponseContext(),
            aRecommendationContext(),
            CodewhispererSuggestionState.Accept,
            Duration.ofSeconds(
                1
            ),
            1,
            50
        )

        verifyNoInteractions(mockClient)
    }
}

// TODO: move these to testUtil
fun aRequestContext(project: Project, myFileContextInfo: FileContextInfo? = null, mySupplementalContextInfo: SupplementalContextInfo? = null): RequestContext {
    val triggerType = listOf(CodewhispererTriggerType.AutoTrigger, CodewhispererTriggerType.OnDemand).random()
    val automatedTriggerType = if (triggerType == CodewhispererTriggerType.AutoTrigger) {
        listOf(
            CodeWhispererAutomatedTriggerType.IdleTime(),
            CodeWhispererAutomatedTriggerType.Enter(),
            CodeWhispererAutomatedTriggerType.SpecialChar('a'),
            CodeWhispererAutomatedTriggerType.IntelliSense()
        ).random()
    } else {
        CodeWhispererAutomatedTriggerType.Unknown()
    }

    return RequestContext(
        project,
        mock(),
        TriggerTypeInfo(triggerType, automatedTriggerType),
        CaretPosition(Random.nextInt(), Random.nextInt()),
        fileContextInfo = myFileContextInfo ?: aFileContextInfo(),
        supplementalContext = mySupplementalContextInfo ?: aSupplementalContextInfo(),
        null,
        LatencyContext(
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextDouble(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            Random.nextLong(),
            aString()
        )
    )
}

fun aSupplementalContextInfo(myContents: List<Chunk>? = null, myIsUtg: Boolean? = null, myLatency: Long? = null): SupplementalContextInfo {
    val contents = mutableListOf<Chunk>()
    val numberOfContent = Random.nextInt(1, 4)
    repeat(numberOfContent) {
        contents.add(
            Chunk(
                content = aString(),
                path = aString(),
            )
        )
    }

    val isUtg = Random.nextBoolean()
    val latency = Random.nextLong(from = 0L, until = 100L)

    return SupplementalContextInfo(
        isUtg = myIsUtg ?: isUtg,
        latency = myLatency ?: latency,
        contents = myContents ?: contents,
        targetFileName = aString(),
        strategy = if (myIsUtg ?: isUtg) UtgStrategy.ByName else CrossFileStrategy.OpenTabsBM25
    )
}

fun aRecommendationContext(): RecommendationContext {
    val details = mutableListOf<DetailContext>()
    val size = Random.nextInt(1, 5)
    for (i in 1..size) {
        details.add(
            DetailContext(
                aString(),
                aCompletion(),
                aCompletion(),
                listOf(true, false).random(),
                listOf(true, false).random(),
                aString(),
                CodewhispererCompletionType.Line
            )
        )
    }

    return RecommendationContext(
        details,
        aString(),
        aString(),
        VisualPosition(Random.nextInt(1, 100), Random.nextInt(1, 100))
    )
}

/**
 * util to generate a RecommendationContext and a SessionContext given expected decisions
 */
fun aRecommendationContextAndSessionContext(decisions: List<CodewhispererSuggestionState>): Pair<RecommendationContext, SessionContext> {
    val table = CodewhispererSuggestionState.values().associateWith { 0 }.toMutableMap()
    decisions.forEach {
        table[it]?.let { curCount -> table[it] = 1 + curCount }
    }

    val details = mutableListOf<DetailContext>()
    decisions.forEach { decision ->
        val toAdd = if (decision == CodewhispererSuggestionState.Empty) {
            val completion = aCompletion("", true, 0, 0)
            DetailContext(aString(), completion, completion, Random.nextBoolean(), Random.nextBoolean(), aString(), CodewhispererCompletionType.Unknown)
        } else if (decision == CodewhispererSuggestionState.Discard) {
            val completion = aCompletion()
            DetailContext(aString(), completion, completion, true, Random.nextBoolean(), aString(), CodewhispererCompletionType.Unknown)
        } else {
            val completion = aCompletion()
            DetailContext(aString(), completion, completion, false, Random.nextBoolean(), aString(), CodewhispererCompletionType.Unknown)
        }

        details.add(toAdd)
    }

    val recommendationContext = RecommendationContext(
        details,
        aString(),
        aString(),
        VisualPosition(Random.nextInt(1, 100), Random.nextInt(1, 100))
    )

    val selectedIndex = decisions.indexOfFirst { it == CodewhispererSuggestionState.Accept }.let {
        if (it != -1) {
            it
        } else {
            0
        }
    }

    val seen = mutableSetOf<Int>()
    decisions.forEachIndexed { index, decision ->
        if (decision != CodewhispererSuggestionState.Unseen) {
            seen.add(index)
        }
    }

    val sessionContext = SessionContext(
        selectedIndex = selectedIndex,
        seen = seen
    )
    return recommendationContext to sessionContext
}

fun aCompletion(content: String? = null, isEmpty: Boolean = false, referenceCount: Int? = null, importCount: Int? = null): Completion {
    val myReferenceCount = referenceCount ?: Random.nextInt(0, 4)
    val myImportCount = importCount ?: Random.nextInt(0, 4)

    val references = List(myReferenceCount) {
        Reference.builder()
            .licenseName(aString())
            .build()
    }

    val imports = List(myImportCount) {
        Import.builder()
            .statement(aString())
            .build()
    }

    return Completion.builder()
        .content(content ?: if (!isEmpty) aString() else "")
        .references(references)
        .mostRelevantMissingImports(imports)
        .build()
}

fun aResponseContext(): ResponseContext = ResponseContext(aString())

fun aFileContextInfo(language: CodeWhispererProgrammingLanguage? = null): FileContextInfo {
    val caretContextInfo = CaretContext(aString(), aString(), aString())
    val fileName = aString()

    val programmingLanguage = language ?: listOf(
        CodeWhispererPython.INSTANCE,
        CodeWhispererJava.INSTANCE
    ).random()

    return FileContextInfo(caretContextInfo, fileName, programmingLanguage)
}
