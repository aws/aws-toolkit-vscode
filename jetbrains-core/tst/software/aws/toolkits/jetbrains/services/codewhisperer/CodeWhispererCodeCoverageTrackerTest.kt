// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.project.Project
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.internal.verification.Times
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.core.utils.test.notNull
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.DetailContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.FileContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.ProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager.Companion.CODEWHISPERER_USER_ACTION_PERFORMED
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.ResponseContext
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererCodeCoverageTracker
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererCodeCoverageTracker.Companion.calculatePercentage
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_SECONDS_IN_MINUTE
import software.aws.toolkits.jetbrains.services.telemetry.NoOpPublisher
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.util.concurrent.atomic.AtomicInteger

class CodeWhispererCodeCoverageTrackerTest {
    private class TestCodePercentageTracker(
        timeWindowInSec: Long,
        language: CodewhispererLanguage,
        acceptedTokens: AtomicInteger = AtomicInteger(0),
        totalTokens: AtomicInteger = AtomicInteger(0),
        rangeMarkers: MutableList<RangeMarker> = mutableListOf()
    ) : CodeWhispererCodeCoverageTracker(timeWindowInSec, language, acceptedTokens, totalTokens, rangeMarkers)

    private class TestTelemetryService(
        publisher: TelemetryPublisher = NoOpPublisher(),
        batcher: TelemetryBatcher
    ) : TelemetryService(publisher, batcher)

    @Rule
    @JvmField
    var projectRule = PythonCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val mockClientManagerRule = MockClientManagerRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private lateinit var project: Project
    private lateinit var fixture: CodeInsightTestFixture
    private lateinit var telemetryServiceSpy: TelemetryService
    private lateinit var batcher: TelemetryBatcher

    private lateinit var invocationContext: InvocationContext
    private lateinit var sessionContext: SessionContext

    @Before
    fun setup() {
        AwsSettings.getInstance().isTelemetryEnabled = true
        project = projectRule.project
        fixture = projectRule.fixture
        fixture.configureByText(pythonFileName, pythonTestLeftContext)
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.primaryCaret.moveToOffset(projectRule.fixture.editor.document.textLength)
        }

        batcher = mock()
        telemetryServiceSpy = spy(TestTelemetryService(batcher = batcher))

        ApplicationManager.getApplication().replaceService(TelemetryService::class.java, telemetryServiceSpy, disposableRule.disposable)
        project.replaceService(CodeWhispererCodeReferenceManager::class.java, mock(), disposableRule.disposable)

        val requestContext = RequestContext(
            project,
            fixture.editor,
            mock(),
            mock(),
            FileContextInfo(mock(), pythonFileName, ProgrammingLanguage(CodewhispererLanguage.Python.toString())),
            mock()
        )
        val responseContext = ResponseContext("sessionId", CodewhispererCompletionType.Block)
        val recommendationContext = RecommendationContext(
            listOf(DetailContext("requestId", pythonResponse.recommendations()[0], pythonResponse.recommendations()[0], false)),
            "x, y",
            "x, y",
            mock()
        )
        invocationContext = InvocationContext(requestContext, responseContext, recommendationContext, mock())
        sessionContext = SessionContext()
    }

    @After
    fun tearDown() {
        CodeWhispererCodeCoverageTracker.getInstancesMap().clear()
    }

    @Test
    fun `test getInstance()`() {
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(0)
        val javaInstance = CodeWhispererCodeCoverageTracker.getInstance(CodewhispererLanguage.Java)
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(1)
        assertThat(javaInstance).notNull

        val javaInstance2 = CodeWhispererCodeCoverageTracker.getInstance(CodewhispererLanguage.Java)
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(1)
        assertThat(javaInstance == javaInstance2).isTrue

        val pythonInstance = CodeWhispererCodeCoverageTracker.getInstance(CodewhispererLanguage.Python)
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(2)
        val pythonInstance2 = CodeWhispererCodeCoverageTracker.getInstance(CodewhispererLanguage.Python)
        assertThat(pythonInstance == pythonInstance2).isTrue

        CodeWhispererCodeCoverageTracker.getInstance(CodewhispererLanguage.Javascript)
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(3)
    }

    @Test
    fun `test tracker is listening to document changes and increment totalTokens - add new code`() {
        val pythonTracker = spy(TestCodePercentageTracker(TOTAL_SECONDS_IN_MINUTE, CodewhispererLanguage.Python, AtomicInteger(0), AtomicInteger(0)))
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodewhispererLanguage.Python] = pythonTracker

        fixture.configureByText(pythonFileName, "")
        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(pythonTestLeftContext)
            }
        }
        val captor = argumentCaptor<DocumentEvent>()
        verify(pythonTracker, Times(1)).documentChanged(captor.capture())
        assertThat(captor.firstValue.newFragment.toString()).isEqualTo(pythonTestLeftContext)
        val oldSize = pythonTracker.totalTokensSize
        assertThat(pythonTracker.totalTokensSize).isEqualTo(pythonTestLeftContext.length)

        val anotherCode = "(x, y):"
        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(anotherCode)
            }
        }
        assertThat(pythonTracker.totalTokensSize).isEqualTo(oldSize + anotherCode.length)
    }

    @Test
    fun `test tracker is listening to document changes and increment totalTokens - delete code`() {
        val pythonTracker =
            spy(TestCodePercentageTracker(TOTAL_SECONDS_IN_MINUTE, CodewhispererLanguage.Python, AtomicInteger(0), AtomicInteger(pythonTestLeftContext.length)))
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodewhispererLanguage.Python] = pythonTracker
        assertThat(pythonTracker.totalTokensSize).isEqualTo(pythonTestLeftContext.length)

        fixture.configureByText(pythonFileName, pythonTestLeftContext)
        runInEdtAndWait {
            fixture.editor.caretModel.primaryCaret.moveToOffset(fixture.editor.document.textLength)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.document.deleteString(fixture.editor.caretModel.offset - 3, fixture.editor.caretModel.offset)
            }
        }

        assertThat(pythonTracker.totalTokensSize).isEqualTo(pythonTestLeftContext.length - 3)
    }

    @Test
    fun `test event CODEWHISPERER_USER_ACTION_PERFORMED will add rangeMarker in the list`() {
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap().size).isEqualTo(0)
        val pythonTracker = TestCodePercentageTracker(TOTAL_SECONDS_IN_MINUTE, language = CodewhispererLanguage.Python)
        val javaTracker = TestCodePercentageTracker(TOTAL_SECONDS_IN_MINUTE, language = CodewhispererLanguage.Java)
        val javascriptTracker = TestCodePercentageTracker(TOTAL_SECONDS_IN_MINUTE, language = CodewhispererLanguage.Javascript)
        assertThat(pythonTracker.acceptedRecommendationsCount).isEqualTo(0)

        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodewhispererLanguage.Python] = pythonTracker
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodewhispererLanguage.Java] = javaTracker
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodewhispererLanguage.Javascript] = javascriptTracker

        fixture.configureByText("test.py", pythonTestLeftContext)
        val rangeMarkerMock: RangeMarker = mock()
        ApplicationManager.getApplication().messageBus.syncPublisher(CODEWHISPERER_USER_ACTION_PERFORMED).afterAccept(
            invocationContext,
            mock(),
            rangeMarkerMock
        )
        assertThat(pythonTracker.acceptedRecommendationsCount).isEqualTo(1)
        assertThat(javascriptTracker.acceptedTokensSize).isEqualTo(0)
    }

    @Test
    fun `test 0 token will return 0%`() {
        fixture.configureByText("/emptyFile.java", "")
        val javaTracker = spy(TestCodePercentageTracker(TOTAL_SECONDS_IN_MINUTE, language = CodewhispererLanguage.Java))
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodewhispererLanguage.Java] = javaTracker
        assertThat(javaTracker.percentage).isEqualTo(0)
    }

    @Test
    fun `test flush() will reset tokens and reschedule next telemetry sending`() {
        val acceptedTokens = "bar"
        val totalTokens = "foo bar"
        val pythonTracker = spy(
            TestCodePercentageTracker(
                TOTAL_SECONDS_IN_MINUTE,
                CodewhispererLanguage.Python,
                AtomicInteger(acceptedTokens.length),
                AtomicInteger(totalTokens.length)
            )
        )

        assertThat(pythonTracker.activeRequestCount()).isEqualTo(1)
        assertThat(pythonTracker.totalTokensSize).isEqualTo(totalTokens.length)
        assertThat(pythonTracker.acceptedTokensSize).isEqualTo(acceptedTokens.length)

        pythonTracker.forceTrackerFlush()

        assertThat(pythonTracker.activeRequestCount()).isEqualTo(1)
        assertThat(pythonTracker.acceptedTokensSize).isEqualTo(0)
        assertThat(pythonTracker.totalTokensSize).isEqualTo(0)
    }

    @Test
    fun `test flush() will emit correct telemetry event -- user delete whole accepted reommendation`() {
        val rangeMarkerMock: RangeMarker = mock()
        whenever(rangeMarkerMock.isValid).thenReturn(false)

        val pythonTracker = TestCodePercentageTracker(
            TOTAL_SECONDS_IN_MINUTE,
            CodewhispererLanguage.Python,
            AtomicInteger(0),
            AtomicInteger(20),
        )
        assertThat(pythonTracker.activeRequestCount()).isEqualTo(1)
        pythonTracker.forceTrackerFlush()

        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, Times(1)).enqueue(metricCaptor.capture())
        CodeWhispererTelemetryTest.assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            CODE_PERCENTAGE,
            1,
            CWSPR_PERCENTAGE to "0",
            CWSPR_Language to CodewhispererLanguage.Python.toString(),
            CWSPR_ACCEPTED_TOKENS to "0",
            CWSPR_TOTAL_TOKENS to "20"
        )
    }

    @Test
    fun `test flush() will emit correct telemetry event`() {
        val rangeMarkerMock1: RangeMarker = mock()
        whenever(rangeMarkerMock1.startOffset).thenReturn(0)
        whenever(rangeMarkerMock1.endOffset).thenReturn(2)
        whenever(rangeMarkerMock1.isValid).thenReturn(true)

        val rangeMarkerMock2: RangeMarker = mock()
        whenever(rangeMarkerMock2.startOffset).thenReturn(0)
        whenever(rangeMarkerMock2.endOffset).thenReturn(8)
        whenever(rangeMarkerMock2.isValid).thenReturn(true)

        val pythonTracker = TestCodePercentageTracker(
            TOTAL_SECONDS_IN_MINUTE,
            CodewhispererLanguage.Python,
            AtomicInteger(10),
            AtomicInteger(80),
            mutableListOf(rangeMarkerMock1, rangeMarkerMock2)
        )
        assertThat(pythonTracker.activeRequestCount()).isEqualTo(1)
        pythonTracker.forceTrackerFlush()

        val acceptedTokens = 10 + rangeMarkerMock1.getAcceptedTokenIncrement() + rangeMarkerMock2.getAcceptedTokenIncrement()
        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, Times(1)).enqueue(metricCaptor.capture())
        CodeWhispererTelemetryTest.assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            CODE_PERCENTAGE,
            1,
            "codewhispererPercentage" to calculatePercentage(acceptedTokens, 80).toString(),
            "codewhispererLanguage" to CodewhispererLanguage.Python.toString(),
            "codewhispererAcceptedTokens" to acceptedTokens.toString(),
            "codewhispererTotalTokens" to "80"
        )
    }

    @Test
    fun `test flush() won't emit telemetry event when users not enabling telemetry`() {
        AwsSettings.getInstance().isTelemetryEnabled = false
        val pythonTracker = TestCodePercentageTracker(TOTAL_SECONDS_IN_MINUTE, CodewhispererLanguage.Python, AtomicInteger(10), AtomicInteger(20))
        pythonTracker.forceTrackerFlush()
        verify(batcher, Times(0)).enqueue(any())
    }

    private fun Editor.appendString(string: String) {
        val currentOffset = caretModel.primaryCaret.offset
        document.insertString(currentOffset, string)
        caretModel.moveToOffset(currentOffset + string.length)
    }

    private fun getRangerMarkerMock(start: Int, end: Int, isValid: Boolean): RangeMarker {
        val rangeMarkerMock: RangeMarker = mock()
        whenever(rangeMarkerMock.startOffset).thenReturn(start)
        whenever(rangeMarkerMock.endOffset).thenReturn(end)
        whenever(rangeMarkerMock.isValid).thenReturn(isValid)
        return rangeMarkerMock
    }

    private fun RangeMarker.getAcceptedTokenIncrement(): Int = this.endOffset - this.startOffset

    private companion object {
        const val CODE_PERCENTAGE = "codewhisperer_codePercentage"
        const val CWSPR_PERCENTAGE = "codewhispererPercentage"
        const val CWSPR_Language = "codewhispererLanguage"
        const val CWSPR_ACCEPTED_TOKENS = "codewhispererAcceptedTokens"
        const val CWSPR_TOTAL_TOKENS = "codewhispererTotalTokens"
    }
}
