// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.google.gson.Gson
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiDocumentManager
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.gradle.internal.impldep.com.amazonaws.ResponseMetadata
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
import org.mockito.kotlin.whenever
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsResponse
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testCodeWhispererException
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testRequestId
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testRequestIdForCodeWhispererException
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testSessionId
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorManager
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.AcceptedSuggestionEntry
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererCodeCoverageTracker
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererUserModificationTracker
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
import kotlin.math.roundToInt

class CodeWhispererTelemetryTest : CodeWhispererTestBase() {
    private val userDecision = "codewhisperer_userDecision"
    private val userModification = "codewhisperer_userModification"
    private val serviceInvocation = "codewhisperer_serviceInvocation"
    private val codePercentage = "codewhisperer_codePercentage"
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
        val trackerSpy = spy(CodeWhispererUserModificationTracker(projectRule.project))
        projectRule.project.replaceService(CodeWhispererUserModificationTracker::class.java, trackerSpy, disposableRule.disposable)

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

    @Test
    fun `test codePercentage metric is correct - 1`() {
        val project = projectRule.project
        val fixture = projectRule.fixture
        val emptyFile = fixture.addFileToProject("/anotherFile.py", "")
        // simulate users typing behavior of the following
        // def addTwoNumbers(
        runInEdtAndWait {
            fixture.openFileInEditor(emptyFile.virtualFile)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(pythonTestLeftContext)
            }
        }
        // simulate users accepting the recommendation and delete part of the recommendation
        // (x, y):\n    return x + y
        val deletedTokenByUser = 4
        withCodeWhispererServiceInvokedAndWait {
            runInEdtAndWait {
                popupManagerSpy.popupComponents.acceptButton.doClick()
                val offset = fixture.caretOffset
                WriteCommandAction.runWriteCommandAction(project) {
                    fixture.editor.document.deleteString(offset - deletedTokenByUser, offset)
                    fixture.editor.caretModel.moveToOffset(fixture.editor.document.textLength)
                }
            }
        }

        CodeWhispererCodeCoverageTracker.getInstance(CodewhispererLanguage.Python).dispose()

        val acceptedTokensSize = pythonResponse.recommendations()[0].content().length - deletedTokenByUser
        val totalTokensSize = pythonTestLeftContext.length + pythonResponse.recommendations()[0].content().length - deletedTokenByUser

        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            codePercentage,
            1,
            "codewhispererAcceptedTokens" to acceptedTokensSize.toString(),
            "codewhispererTotalTokens" to totalTokensSize.toString(),
            "codewhispererPercentage" to (acceptedTokensSize.toDouble() / totalTokensSize * 100).roundToInt().toString()
        )
    }

    @Test
    fun `test codePercentage metric is correct - 2`() {
        val project = projectRule.project
        val fixture = projectRule.fixture
        val emptyFile = fixture.addFileToProject("/anotherFile.py", "")
        // simulate users typing behavior of the following
        // def addTwoNumbers
        runInEdtAndWait {
            fixture.openFileInEditor(emptyFile.virtualFile)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(pythonTestLeftContext)
            }
        }
        // simulate users accepting the recommendation
        // (x, y):\n    return x + y
        val anotherCodeSnippet = "\ndef functionWritenByMyself():\n\tpass()"
        withCodeWhispererServiceInvokedAndWait {
            runInEdtAndWait {
                popupManagerSpy.popupComponents.acceptButton.doClick()
                WriteCommandAction.runWriteCommandAction(project) {
                    fixture.editor.appendString(anotherCodeSnippet)
                    val currentOffset = fixture.editor.caretModel.offset
                    // delete 1 char
                    fixture.editor.document.deleteString(currentOffset - 1, currentOffset)
                }
                // use dispose() to froce tracker to emit telemetry
                CodeWhispererCodeCoverageTracker.getInstance(CodewhispererLanguage.Python).dispose()
            }
        }

        val acceptedTokensSize = pythonResponse.recommendations()[0].content().length
        val totalTokensSize = pythonTestLeftContext.length + pythonResponse.recommendations()[0].content().length + anotherCodeSnippet.length - 1

        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            codePercentage,
            1,
            "codewhispererAcceptedTokens" to acceptedTokensSize.toString(),
            "codewhispererTotalTokens" to totalTokensSize.toString(),
            "codewhispererPercentage" to (acceptedTokensSize.toDouble() / totalTokensSize * 100).roundToInt().toString()
        )
    }

    @Test
    fun `test codePercentage metric is correct - simulate IDE adding right closing paren`() {
        val project = projectRule.project
        val fixture = projectRule.fixture
        val emptyFile = fixture.addFileToProject("/anotherFile.py", "")
        // simulate users typing behavior of the following
        // def addTwoNumbers(
        whenever(mockClient.listRecommendations(any<ListRecommendationsRequest>())).thenReturn(
            ListRecommendationsResponse.builder()
                .recommendations(
                    CodeWhispererTestUtil.generateMockRecommendationDetail("x, y):\n    return x + y"),
                    CodeWhispererTestUtil.generateMockRecommendationDetail("a, b):\n    return a + b"),
                    CodeWhispererTestUtil.generateMockRecommendationDetail("test recommendation 3"),
                    CodeWhispererTestUtil.generateMockRecommendationDetail("test recommendation 4"),
                    CodeWhispererTestUtil.generateMockRecommendationDetail("test recommendation 5")
                )
                .nextToken("")
                .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(ResponseMetadata.AWS_REQUEST_ID to testRequestId)))
                .sdkHttpResponse(SdkHttpResponse.builder().headers(mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))).build())
                .build() as ListRecommendationsResponse
        )

        runInEdtAndWait {
            fixture.openFileInEditor(emptyFile.virtualFile)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString("$pythonTestLeftContext(")
                // add closing paren but not move the caret position, simulating IDE's behavior
                fixture.editor.document.insertString(fixture.editor.caretModel.offset, ")")
            }
        }

        withCodeWhispererServiceInvokedAndWait {
            runInEdtAndWait {
                popupManagerSpy.popupComponents.acceptButton.doClick()
            }
        }
        CodeWhispererCodeCoverageTracker.getInstance(CodewhispererLanguage.Python).dispose()

        val acceptedTokensSize = "x, y):\n    return x + y".length
        val totalTokensSize = "$pythonTestLeftContext(".length + acceptedTokensSize
        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
        metricCaptor.allValues.forEach { println(it) }
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            codePercentage,
            1,
            "codewhispererAcceptedTokens" to acceptedTokensSize.toString(),
            "codewhispererTotalTokens" to totalTokensSize.toString(),
            "codewhispererPercentage" to (acceptedTokensSize.toDouble() / totalTokensSize * 100).roundToInt().toString()
        )

        metricCaptor.allValues.forEach { println(it) }
    }

    private fun Editor.appendString(string: String) {
        val currentOffset = caretModel.primaryCaret.offset
        document.insertString(currentOffset, string)
        caretModel.moveToOffset(currentOffset + string.length)
        PsiDocumentManager.getInstance(projectRule.project).commitDocument(document)
    }

    @After
    override fun tearDown() {
        super.tearDown()
        telemetryService.dispose()
        AwsSettings.getInstance().isTelemetryEnabled = isTelemetryEnabledDefault
        CodeWhispererCodeCoverageTracker.getInstancesMap().clear()
    }

    companion object {
        fun assertEventsContainsFieldsAndCount(
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
    }
}
