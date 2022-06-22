// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.google.gson.Gson
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.atLeast
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import org.mockito.kotlin.timeout
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsRequest
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testCodeWhispererException
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testRequestId
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testRequestIdForCodeWhispererException
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testSessionId
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorManager
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.AcceptedSuggestionEntry
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTracker
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CaretMovement
import software.aws.toolkits.jetbrains.services.telemetry.NoOpPublisher
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import software.aws.toolkits.telemetry.CodewhispererLanguage
import software.aws.toolkits.telemetry.CodewhispererRuntime
import software.aws.toolkits.telemetry.CodewhispererSuggestionState
import software.aws.toolkits.telemetry.CodewhispererTriggerType
import software.aws.toolkits.telemetry.Result
import java.time.Instant

class CodeWhispererTelemetryTest : CodeWhispererTestBase() {
    private val userDecision = "codewhisperer_userDecision"
    private val userModification = "codewhisperer_userModification"
    private val serviceInvocation = "codewhisperer_serviceInvocation"
    private val codewhispererSuggestionState = "codewhispererSuggestionState"

    private class TestTelemetryService(
        publisher: TelemetryPublisher = NoOpPublisher(),
        batcher: TelemetryBatcher
    ) : TelemetryService(publisher, batcher)

    private lateinit var telemetryService: TelemetryService
    private lateinit var batcher: TelemetryBatcher
    private lateinit var telemetryServiceSpy: TelemetryService
    private var isTelemetryEnabledDefault: Boolean = false

    @Before
    override fun setUp() {
        super.setUp()
        batcher = mock<TelemetryBatcher>()
        telemetryService = TestTelemetryService(batcher = batcher)
        telemetryServiceSpy = spy(telemetryService)
        ApplicationManager.getApplication().replaceService(TelemetryService::class.java, telemetryServiceSpy, disposableRule.disposable)
        isTelemetryEnabledDefault = AwsSettings.getInstance().isTelemetryEnabled
        AwsSettings.getInstance().isTelemetryEnabled = true
    }

    @Test
    fun `test pre-setup failure will send service invocation event with failed status`() {
        val codewhispererServiceSpy = spy(codewhispererService) {
            onGeneric { getRequestContext(any(), any(), any(), any()) }
                .doAnswer { throw Exception() }
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererService::class.java, codewhispererServiceSpy, disposableRule.disposable)

        invokeCodeWhispererService()

        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            assertEventsContainsFieldsAndCount(
                allValues, serviceInvocation, 1,
                "result" to Result.Failed.toString()
            )
        }
    }

    @Test
    fun `test accepting recommendation will send user modification events with 1 accepted other unseen`() {
        val trackerSpy = spy(CodeWhispererTracker(projectRule.project))
        projectRule.project.replaceService(CodeWhispererTracker::class.java, trackerSpy, disposableRule.disposable)

        runInEdtAndWait {
            val fakeSuggestionEntry = AcceptedSuggestionEntry(
                Instant.now().minusSeconds(350),
                projectRule.fixture.file.virtualFile,
                projectRule.fixture.editor.document.createRangeMarker(0, 0, true),
                "",
                testSessionId,
                testRequestId,
                0,
                CodewhispererTriggerType.OnDemand,
                CodewhispererCompletionType.Line,
                CodewhispererLanguage.Java,
                CodewhispererRuntime.Java11,
                ""
            )
            trackerSpy.stub {
                onGeneric {
                    trackerSpy.enqueue(any())
                }.doAnswer {
                    trackerSpy.enqueue(fakeSuggestionEntry)
                }.thenCallRealMethod()
            }
        }

        withCodeWhispererServiceInvokedAndWait {
            runInEdtAndWait {
                popupManagerSpy.popupComponents.acceptButton.doClick()
                trackerSpy.dispose()
            }
        }
        val count = pythonResponse.recommendations().size
        argumentCaptor<MetricEvent>().apply {
            // 1 serviceInvocation + 1 userModification + 1 userDecision for accepted +
            // (count - 1) userDecisions for ignored
            verify(batcher, atLeast(2 + count)).enqueue(capture())
            assertEventsContainsFieldsAndCount(allValues, serviceInvocation, 1)
            assertEventsContainsFieldsAndCount(
                allValues, userModification, 1,
                "codewhispererSessionId" to testSessionId
            )
            assertEventsContainsFieldsAndCount(
                allValues, userDecision, 1,
                codewhispererSuggestionState to CodewhispererSuggestionState.Accept.toString()
            )
            assertEventsContainsFieldsAndCount(
                allValues, userDecision, count - 1,
                codewhispererSuggestionState to CodewhispererSuggestionState.Unseen.toString()
            )
        }
    }

    @Test
    fun `test cancelling popup will send user decision event for all unseen but one rejected`() {
        val statesCaptor = argumentCaptor<InvocationContext>()

        withCodeWhispererServiceInvokedAndWait {
            verify(popupManagerSpy).render(statesCaptor.capture(), any(), any())

            runInEdtAndWait {
                popupManagerSpy.cancelPopup(statesCaptor.firstValue.popup)
            }

            val count = pythonResponse.recommendations().size
            argumentCaptor<MetricEvent>().apply {
                verify(batcher, atLeast(1 + count)).enqueue(capture())
                assertEventsContainsFieldsAndCount(
                    allValues, serviceInvocation, 1,
                    "result" to Result.Succeeded.toString()
                )
                assertEventsContainsFieldsAndCount(
                    allValues, userDecision, 1,
                    codewhispererSuggestionState to CodewhispererSuggestionState.Reject.toString()
                )
                assertEventsContainsFieldsAndCount(
                    allValues, userDecision, count - 1,
                    codewhispererSuggestionState to CodewhispererSuggestionState.Unseen.toString()
                )
            }
        }
    }

    @Test
    fun `test invoking CodeWhisperer will send service invocation event with succeeded status`() {
        withCodeWhispererServiceInvokedAndWait {
            argumentCaptor<MetricEvent>().apply {
                verify(batcher, atLeastOnce()).enqueue(capture())
                assertEventsContainsFieldsAndCount(
                    allValues, serviceInvocation, 1,
                    "result" to Result.Succeeded.toString()
                )
            }
        }
    }

    @Test
    fun `test moving caret backwards before getting back response will send user decision events for all discarded`() {
        val editorManagerSpy = spy(editorManager)
        editorManagerSpy.stub {
            onGeneric {
                getCaretMovement(any(), any())
            } doAnswer {
                CaretMovement.MOVE_BACKWARD
            }
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererEditorManager::class.java, editorManagerSpy, disposableRule.disposable)

        invokeCodeWhispererService()

        val count = pythonResponse.recommendations().size
        runInEdtAndWait {
            argumentCaptor<MetricEvent>().apply {
                verify(batcher, atLeast(1 + count)).enqueue(capture())
                assertEventsContainsFieldsAndCount(
                    allValues, serviceInvocation, 1,
                    "result" to Result.Succeeded.toString()
                )
                assertEventsContainsFieldsAndCount(
                    allValues, userDecision, count,
                    codewhispererSuggestionState to CodewhispererSuggestionState.Discard.toString()
                )
            }
        }
    }

    @Test
    fun `test user's typeahead before getting response will discard recommendations whose prefix not matching`() {
        val editorManagerSpy = spy(editorManager)
        val typeahead = "(x, y)"
        editorManagerSpy.stub {
            onGeneric {
                getUserInputSinceInvocation(any(), any())
            } doAnswer {
                typeahead
            }
            onGeneric {
                getCaretMovement(any(), any())
            } doAnswer {
                CaretMovement.MOVE_FORWARD
            }
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererEditorManager::class.java, editorManagerSpy, disposableRule.disposable)

        withCodeWhispererServiceInvokedAndWait { }
        val prefixNotMatchCount = pythonResponse.recommendations().filter {
            !it.content().startsWith(typeahead)
        }.size
        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeast(1 + prefixNotMatchCount)).enqueue(capture())
            assertEventsContainsFieldsAndCount(
                allValues, serviceInvocation, 1,
                "result" to Result.Succeeded.toString()
            )
            assertEventsContainsFieldsAndCount(
                allValues, userDecision, prefixNotMatchCount,
                codewhispererSuggestionState to CodewhispererSuggestionState.Discard.toString()
            )
        }
    }

    @Test
    fun `test getting non-CodeWhisperer Exception will return empty request id`() {
        mockClient.stub {
            on {
                this.listRecommendations(any<ListRecommendationsRequest>())
            } doAnswer {
                throw Exception("wrong path")
            }
        }

        invokeCodeWhispererService()

        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            assertEventsContainsFieldsAndCount(
                allValues, serviceInvocation, 1,
                "codewhispererRequestId" to "",
                "result" to Result.Failed.toString()
            )
        }
    }

    @Test
    fun `test getting CodeWhispererException will capture request id`() {
        mockClient.stub {
            on {
                this.listRecommendations(any<ListRecommendationsRequest>())
            } doAnswer {
                throw testCodeWhispererException
            }
        }

        invokeCodeWhispererService()

        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            assertEventsContainsFieldsAndCount(
                allValues, serviceInvocation, 1,
                "codewhispererRequestId" to testRequestIdForCodeWhispererException,
                "result" to Result.Failed.toString()
            )
        }
    }

    @Test
    fun `test enable CodeWhisperer license filters will send user decision events with state Filter`() {
        CodeWhispererSettings.getInstance().toggleIncludeCodeWithReference(false)
        invokeCodeWhispererService()
        runInEdtAndWait {
            verify(popupManagerSpy, timeout(5000)).cancelPopup(any())
        }
        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeast(1 + pythonResponse.recommendations().size)).enqueue(capture())
            assertEventsContainsFieldsAndCount(
                allValues, userDecision, pythonResponse.recommendations().size,
                "codewhispererSuggestionState" to CodewhispererSuggestionState.Filter.toString()
            )
        }
    }

    @Test
    fun `test user Decision events record CodeWhisperer reference info`() {
        withCodeWhispererServiceInvokedAndWait {}
        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            pythonResponse.recommendations().forEach {
                assertEventsContainsFieldsAndCount(
                    allValues, userDecision, 1,
                    "codewhispererSuggestionReferences" to Gson().toJson(it.references().map { ref -> ref.licenseName() }.toSet()),
                    "codewhispererSuggestionReferenceCount" to it.references().size.toString(),
                    atLeast = true
                )
            }
        }
    }

    @Test
    fun `test invoking CodeWhisperer will send service invocation event with sessionId and requestId from response`() {
        val statesCaptor = argumentCaptor<InvocationContext>()
        withCodeWhispererServiceInvokedAndWait {
            verify(popupManagerSpy, timeout(5000).atLeastOnce()).render(statesCaptor.capture(), any(), any())
            val states = statesCaptor.lastValue
            val metricCaptor = argumentCaptor<MetricEvent>()
            verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
            assertEventsContainsFieldsAndCount(
                metricCaptor.allValues, serviceInvocation, 1,
                "codewhispererSessionId" to states.responseContext.sessionId,
                "codewhispererRequestId" to states.recommendationContext.details[0].requestId
            )
        }
    }

    @Test
    fun `test userDecision events will record sessionId and requestId from response`() {
        val statesCaptor = argumentCaptor<InvocationContext>()
        withCodeWhispererServiceInvokedAndWait {}
        verify(popupManagerSpy, timeout(5000).atLeastOnce()).render(statesCaptor.capture(), any(), any())
        val states = statesCaptor.lastValue
        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues, userDecision, states.recommendationContext.details.size,
            "codewhispererSessionId" to states.responseContext.sessionId,
            "codewhispererRequestId" to states.recommendationContext.details[0].requestId,
        )
    }

    private fun assertEventsContainsFieldsAndCount(
        events: Collection<MetricEvent>,
        name: String,
        count: Int,
        vararg keyValues: Pair<String, String>,
        atLeast: Boolean = false
    ) {
        assertThat(events).filteredOn { event ->
            event.data.any {
                it.name == name && isThisMapContains(it.metadata, *keyValues)
            }
        }.apply {
            if (atLeast) {
                hasSizeGreaterThanOrEqualTo(count)
            } else {
                hasSize(count)
            }
        }
    }

    private fun isThisMapContains(map: Map<String, String>, vararg keyValues: Pair<String, String>): Boolean {
        keyValues.forEach {
            val flag = (map.containsKey(it.first) && map[it.first] == it.second)
            if (!flag) return false
        }
        return true
    }

    @After
    override fun tearDown() {
        super.tearDown()
        telemetryService.dispose()
        AwsSettings.getInstance().isTelemetryEnabled = isTelemetryEnabledDefault
    }
}
