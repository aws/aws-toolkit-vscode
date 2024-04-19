// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
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
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhispererruntime.model.SendTelemetryEventResponse
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.jetbrains.AwsPlugin
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.credentials.LegacyManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutomatedTriggerType
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroup
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupStates
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTelemetryService
import software.aws.toolkits.jetbrains.services.telemetry.NoOpPublisher
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.telemetry.CodewhispererPreviousSuggestionState
import software.aws.toolkits.telemetry.CodewhispererSuggestionState
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
    private lateinit var mockClient: CodeWhispererClientAdaptor

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
                    version = AwsToolkit.PLUGINS_INFO.getValue(AwsPlugin.TOOLKIT).version,
                    settings = mapOf(CodeWhispererUserGroupSettings.USER_GROUP_KEY to CodeWhispererUserGroup.Control.name)
                )
            )
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererUserGroupSettings::class.java, groupSettings, disposableRule.disposable)

        mockClient = spy(CodeWhispererClientAdaptor.getInstance(projectRule.project))
        mockClient.stub {
            onGeneric {
                sendUserTriggerDecisionTelemetry(any(), any(), any(), any(), any(), any(), any())
            }.doAnswer {
                mock<SendTelemetryEventResponse>()
            }
        }
        projectRule.project.replaceService(CodeWhispererClientAdaptor::class.java, mockClient, disposableRule.disposable)
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
        val charCount = Random.nextInt(0, 100)

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
            lineCount,
            charCount
        )

        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            CodeWhispererTelemetryTest.assertEventsContainsFieldsAndCount(
                allValues,
                "codewhisperer_userTriggerDecision",
                1,
                "codewhispererSessionId" to responseContext.sessionId,
                "codewhispererFirstRequestId" to requestContext.latencyContext.firstRequestId,
                "codewhispererCompletionType" to recommendationContext.details[0].completionType,
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
                "codewhispererSupplementalContextLength" to supplementalContextInfo.contentLength,
                "codewhispererCharactersAccepted" to charCount
            )
        }
    }

    @Test
    fun `sendUserDecisionEventForAll will send userDecision event for all suggestions`() {
        doNothing().whenever(sut).sendUserTriggerDecisionEvent(any(), any(), any(), any(), any(), any(), any(), any())
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

    private fun testSendTelemetryEventWithDifferentConfigsHelper(isProTier: Boolean, isTelemetryEnabled: Boolean) {
        val mockStatesManager = mock<CodeWhispererExplorerActionManager>()
        ApplicationManager.getApplication().replaceService(
            CodeWhispererExplorerActionManager::class.java,
            mockStatesManager,
            disposableRule.disposable
        )

        val mockSsoConnection = mock<LegacyManagedBearerSsoConnection> {
            on { this.startUrl } doReturn if (isProTier) "fake sso url" else SONO_URL
        }

        projectRule.project.replaceService(
            ToolkitConnectionManager::class.java,
            mock { on { activeConnectionForFeature(eq(CodeWhispererConnection.getInstance())) } doReturn mockSsoConnection },
            disposableRule.disposable
        )
        AwsSettings.getInstance().isTelemetryEnabled = isTelemetryEnabled

        val expectedRequestContext = aRequestContext(projectRule.project)
        val expectedResponseContext = aResponseContext()
        val expectedRecommendationContext = aRecommendationContext()
        val expectedSuggestionState = aSuggestionState()
        val expectedDuration = Duration.ofSeconds(1)
        val expectedSuggestionReferenceCount = 1
        val expectedGeneratedLineCount = 50
        val expectedCharCount = 100
        val expectedCompletionType = expectedRecommendationContext.details[0].completionType
        sut.sendUserTriggerDecisionEvent(
            expectedRequestContext,
            expectedResponseContext,
            expectedRecommendationContext,
            expectedSuggestionState,
            expectedDuration,
            expectedSuggestionReferenceCount,
            expectedGeneratedLineCount,
            expectedCharCount
        )

        if (isProTier || isTelemetryEnabled) {
            verify(mockClient).sendUserTriggerDecisionTelemetry(
                eq(expectedRequestContext),
                eq(expectedResponseContext),
                eq(expectedCompletionType),
                eq(expectedSuggestionState),
                eq(expectedSuggestionReferenceCount),
                eq(expectedGeneratedLineCount),
                eq(expectedRecommendationContext.details.size),
            )
        } else {
            verifyNoInteractions(mockClient)
        }
    }

    @Test
    fun `should invoke sendTelemetryEvent if opt out telemetry, for SSO users`() {
        testSendTelemetryEventWithDifferentConfigsHelper(isProTier = true, isTelemetryEnabled = false)
    }

    @Test
    fun `should not invoke sendTelemetryEvent if opt out telemetry, for Builder ID users`() {
        testSendTelemetryEventWithDifferentConfigsHelper(isProTier = false, isTelemetryEnabled = false)
    }

    @Test
    fun `should invoke sendTelemetryEvent if opt in telemetry, for SSO users`() {
        testSendTelemetryEventWithDifferentConfigsHelper(isProTier = true, isTelemetryEnabled = true)
    }

    @Test
    fun `should invoke sendTelemetryEvent if opt in telemetry, for Builder ID users`() {
        testSendTelemetryEventWithDifferentConfigsHelper(isProTier = false, isTelemetryEnabled = true)
    }
}
