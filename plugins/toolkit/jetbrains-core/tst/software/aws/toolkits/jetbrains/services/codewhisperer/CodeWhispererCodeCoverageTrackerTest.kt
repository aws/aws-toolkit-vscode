// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.internal.verification.Times
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.keystrokeInput
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.model.DetailContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.FileContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SupplementalContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager.Companion.CODEWHISPERER_USER_ACTION_PERFORMED
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.ResponseContext
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeCoverageTokens
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererCodeCoverageTracker
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_SECONDS_IN_MINUTE
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CrossFileStrategy
import software.aws.toolkits.jetbrains.services.telemetry.NoOpPublisher
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import java.util.concurrent.atomic.AtomicInteger

internal abstract class CodeWhispererCodeCoverageTrackerTestBase(myProjectRule: CodeInsightTestFixtureRule) {
    protected class TestCodePercentageTracker(
        project: Project,
        timeWindowInSec: Long,
        language: CodeWhispererProgrammingLanguage,
        rangeMarkers: MutableList<RangeMarker> = mutableListOf(),
        codeCoverageTokens: MutableMap<Document, CodeCoverageTokens> = mutableMapOf(),
        invocationCount: Int = 0,
    ) : CodeWhispererCodeCoverageTracker(project, timeWindowInSec, language, rangeMarkers, codeCoverageTokens, AtomicInteger(invocationCount))

    protected class TestTelemetryService(
        publisher: TelemetryPublisher = NoOpPublisher(),
        batcher: TelemetryBatcher
    ) : TelemetryService(publisher, batcher)

    @Rule
    @JvmField
    val projectRule: CodeInsightTestFixtureRule

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val mockClientManagerRule = MockClientManagerRule()

    protected lateinit var project: Project
    protected lateinit var fixture: CodeInsightTestFixture
    protected lateinit var telemetryServiceSpy: TelemetryService
    protected lateinit var batcher: TelemetryBatcher
    protected lateinit var exploreActionManagerMock: CodeWhispererExplorerActionManager
    protected lateinit var sut: CodeWhispererCodeCoverageTracker

    init {
        this.projectRule = myProjectRule
    }

    open fun setup() {
        this.project = projectRule.project
        this.fixture = projectRule.fixture
        AwsSettings.getInstance().isTelemetryEnabled = true
        batcher = mock()
        telemetryServiceSpy = spy(TestTelemetryService(batcher = batcher))

        exploreActionManagerMock = mock {
            on { checkActiveCodeWhispererConnectionType(any()) } doReturn CodeWhispererLoginType.Sono
        }

        ApplicationManager.getApplication().replaceService(CodeWhispererExplorerActionManager::class.java, exploreActionManagerMock, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(TelemetryService::class.java, telemetryServiceSpy, disposableRule.disposable)
    }

    @After
    fun tearDown() {
        CodeWhispererCodeCoverageTracker.getInstancesMap().clear()
        if (::sut.isInitialized) {
            sut.forceTrackerFlush()
        }
    }

    protected companion object {
        const val CODE_PERCENTAGE = "codewhisperer_codePercentage"
        const val CWSPR_PERCENTAGE = "codewhispererPercentage"
        const val CWSPR_Language = "codewhispererLanguage"
        const val CWSPR_ACCEPTED_TOKENS = "codewhispererAcceptedTokens"
        const val CWSPR_TOTAL_TOKENS = "codewhispererTotalTokens"
    }
}

internal class CodeWhispererCodeCoverageTrackerTestPython : CodeWhispererCodeCoverageTrackerTestBase(PythonCodeInsightTestFixtureRule()) {
    private lateinit var invocationContext: InvocationContext
    private lateinit var sessionContext: SessionContext

    @Before
    override fun setup() {
        super.setup()
        fixture.configureByText(pythonFileName, pythonTestLeftContext)
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.primaryCaret.moveToOffset(projectRule.fixture.editor.document.textLength)
        }

        val requestContext = RequestContext(
            project,
            fixture.editor,
            mock(),
            mock(),
            FileContextInfo(mock(), pythonFileName, CodeWhispererPython.INSTANCE),
            SupplementalContextInfo(isUtg = false, contents = emptyList(), targetFileName = "", strategy = CrossFileStrategy.Empty, latency = 0L),
            null,
            mock(),
            aString()
        )
        val responseContext = ResponseContext("sessionId")
        val recommendationContext = RecommendationContext(
            listOf(
                DetailContext(
                    "requestId",
                    pythonResponse.completions()[0],
                    pythonResponse.completions()[0],
                    false,
                    false,
                    "",
                    CodewhispererCompletionType.Block
                )
            ),
            "x, y",
            "x, y",
            mock()
        )
        invocationContext = InvocationContext(requestContext, responseContext, recommendationContext, mock())
        sessionContext = SessionContext()

        // it is needed because referenceManager is listening to CODEWHISPERER_USER_ACTION_PERFORMED topic
        project.replaceService(CodeWhispererCodeReferenceManager::class.java, mock(), disposableRule.disposable)
    }

    @Test
    fun `test getInstance()`() {
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(0)
        val javaInstance = CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererJava.INSTANCE)
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(1)
        assertThat(javaInstance).isNotNull

        val javaInstance2 = CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererJava.INSTANCE)
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(1)
        assertThat(javaInstance == javaInstance2).isTrue

        val pythonInstance = CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererPython.INSTANCE)
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(2)
        val pythonInstance2 = CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererPython.INSTANCE)
        assertThat(pythonInstance == pythonInstance2).isTrue

        CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererJavaScript.INSTANCE)
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(3)
    }

    @Test
    fun `test tracker is listening to codewhisperer recommendation service invocation`() {
        sut = TestCodePercentageTracker(project, TOTAL_SECONDS_IN_MINUTE, CodeWhispererPython.INSTANCE)
        val jsxTracker = TestCodePercentageTracker(project, TOTAL_SECONDS_IN_MINUTE, CodeWhispererJsx.INSTANCE)
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodeWhispererPython.INSTANCE] = sut
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodeWhispererJsx.INSTANCE] = jsxTracker
        sut.activateTrackerIfNotActive()
        assertThat(sut.serviceInvocationCount).isEqualTo(0)
        assertThat(jsxTracker.serviceInvocationCount).isEqualTo(0)

        val fileContextInfo = mock<FileContextInfo> { on { programmingLanguage } doReturn CodeWhispererPython.INSTANCE }
        ApplicationManager.getApplication().messageBus.syncPublisher(CodeWhispererService.CODEWHISPERER_CODE_COMPLETION_PERFORMED).onSuccess(fileContextInfo)
        assertThat(sut.serviceInvocationCount).isEqualTo(1)
        assertThat(jsxTracker.serviceInvocationCount).isEqualTo(0)
    }

    @Test
    fun `test tracker is listening to document changes and increment totalTokens - add new code`() {
        sut = spy(TestCodePercentageTracker(project, TOTAL_SECONDS_IN_MINUTE, CodeWhispererPython.INSTANCE))
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodeWhispererPython.INSTANCE] = sut
        sut.activateTrackerIfNotActive()

        fixture.configureByText(pythonFileName, "")
        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(keystrokeInput)
            }
        }
        val captor = argumentCaptor<DocumentEvent>()
        verify(sut, Times(1)).documentChanged(captor.capture())
        assertThat(captor.firstValue.newFragment.toString()).isEqualTo(keystrokeInput)
        assertThat(sut.totalTokensSize).isEqualTo(keystrokeInput.length)
    }

    @Test
    fun `test tracker is not listening to multi char input and will not increment totalTokens - add new code`() {
        sut = spy(TestCodePercentageTracker(project, TOTAL_SECONDS_IN_MINUTE, CodeWhispererPython.INSTANCE))
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodeWhispererPython.INSTANCE] = sut
        sut.activateTrackerIfNotActive()

        fixture.configureByText(pythonFileName, "")
        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(pythonTestLeftContext)
            }
        }
        val captor = argumentCaptor<DocumentEvent>()
        verify(sut, Times(1)).documentChanged(captor.capture())
        assertThat(captor.firstValue.newFragment.toString()).isEqualTo(pythonTestLeftContext)
        assertThat(sut.totalTokensSize).isEqualTo(0)

        val anotherCode = "(x, y):"
        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(anotherCode)
            }
        }
        assertThat(sut.totalTokensSize).isEqualTo(0)
    }

    @Test
    fun `test tracker is listening to document changes and increment totalTokens - delete code should not affect`() {
        sut = TestCodePercentageTracker(
            project,
            TOTAL_SECONDS_IN_MINUTE,
            CodeWhispererPython.INSTANCE,
            codeCoverageTokens = mutableMapOf(fixture.editor.document to CodeCoverageTokens(pythonTestLeftContext.length, 0))
        )

        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodeWhispererPython.INSTANCE] = sut
        sut.activateTrackerIfNotActive()
        assertThat(sut.totalTokensSize).isEqualTo(pythonTestLeftContext.length)

        runInEdtAndWait {
            fixture.editor.caretModel.primaryCaret.moveToOffset(fixture.editor.document.textLength)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.document.deleteString(fixture.editor.caretModel.offset - 3, fixture.editor.caretModel.offset)
            }
        }

        assertThat(sut.totalTokensSize).isEqualTo(pythonTestLeftContext.length)
    }

    @Test
    fun `test tracker documentChanged - will increment tokens on user input blank string`() {
        sut = TestCodePercentageTracker(
            project,
            TOTAL_SECONDS_IN_MINUTE,
            CodeWhispererPython.INSTANCE,
            codeCoverageTokens = mutableMapOf(fixture.editor.document to CodeCoverageTokens(pythonTestLeftContext.length, 0))
        )
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodeWhispererPython.INSTANCE] = sut
        sut.activateTrackerIfNotActive()
        assertThat(sut.totalTokensSize).isEqualTo(pythonTestLeftContext.length)

        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.document.insertString(fixture.editor.caretModel.offset, "\t")
            }
        }

        assertThat(sut.totalTokensSize).isEqualTo(pythonTestLeftContext.length + 1)
    }

    @Test
    fun `test msg CODEWHISPERER_USER_ACTION_PERFORMED will add rangeMarker in the list`() {
        sut = spy(TestCodePercentageTracker(project, TOTAL_SECONDS_IN_MINUTE, language = CodeWhispererPython.INSTANCE))
        sut.activateTrackerIfNotActive()
        val rangeMarkerMock = runInEdtAndGet {
            spy(fixture.editor.document.createRangeMarker(0, 3)) {
                on { isValid } doReturn true
            }
        }

        ApplicationManager.getApplication().messageBus.syncPublisher(CODEWHISPERER_USER_ACTION_PERFORMED).afterAccept(
            invocationContext,
            mock(),
            rangeMarkerMock
        )

        assertThat(sut.acceptedRecommendationsCount).isEqualTo(1)
        val argumentCaptor = argumentCaptor<String>()
        verify(rangeMarkerMock, atLeastOnce()).putUserData(any<Key<String>>(), argumentCaptor.capture())
        assertThat(argumentCaptor.firstValue).isEqualTo(pythonTestLeftContext.substring(0, 3))
    }

    @Test
    fun `test 0 totalTokens will return null`() {
        sut = spy(TestCodePercentageTracker(project, TOTAL_SECONDS_IN_MINUTE, language = CodeWhispererJava.INSTANCE))
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodeWhispererJava.INSTANCE] = sut
        assertThat(sut.percentage).isNull()
    }

    @Test
    fun `test flush() will reset tokens and reschedule next telemetry sending`() {
        sut = TestCodePercentageTracker(
            project,
            TOTAL_SECONDS_IN_MINUTE,
            CodeWhispererPython.INSTANCE,
            codeCoverageTokens = mutableMapOf(mock<Document>() to CodeCoverageTokens("foobar".length, "bar".length))
        )

        sut.activateTrackerIfNotActive()
        assertThat(sut.activeRequestCount()).isEqualTo(1)
        assertThat(sut.acceptedTokensSize).isEqualTo("bar".length)
        assertThat(sut.totalTokensSize).isEqualTo("foobar".length)

        sut.forceTrackerFlush()

        assertThat(sut.activeRequestCount()).isEqualTo(1)
        assertThat(sut.acceptedTokensSize).isEqualTo(0)
        assertThat(sut.totalTokensSize).isEqualTo(0)
    }

    @Test
    fun `test when rangeMarker is not vaild, acceptedToken will not be updated`() {
        // when user delete whole recommendation, rangeMarker will be isValid = false
        val rangeMarkerMock: RangeMarker = mock()
        whenever(rangeMarkerMock.isValid).thenReturn(false)
        sut = spy(
            TestCodePercentageTracker(
                project,
                TOTAL_SECONDS_IN_MINUTE,
                CodeWhispererPython.INSTANCE,
                mutableListOf(rangeMarkerMock),
            )
        ) {
            onGeneric { getAcceptedTokensDelta(any(), any()) } doReturn 100
        }

        sut.activateTrackerIfNotActive()
        sut.forceTrackerFlush()

        verify(sut, Times(0)).getAcceptedTokensDelta(any(), any())
    }

    @Test
    fun `test flush() will call emitTelemetry automatically schedule next call`() {
        sut = spy(
            TestCodePercentageTracker(
                project,
                TOTAL_SECONDS_IN_MINUTE,
                CodeWhispererPython.INSTANCE,
            )
        )
        doNothing().whenever(sut).emitCodeWhispererCodeContribution()

        sut.activateTrackerIfNotActive()
        assertThat(sut.activeRequestCount()).isEqualTo(1)
        sut.forceTrackerFlush()

        verify(sut, Times(1)).emitCodeWhispererCodeContribution()
        assertThat(sut.activeRequestCount()).isEqualTo(1)
    }

    @Test
    fun `test emitCodeWhispererCodeContribution`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        val rangeMarkerMock1 = mock<RangeMarker> {
            on { isValid } doReturn true
            on { getUserData(any<Key<String>>()) } doReturn "foo"
            on { document } doReturn fixture.editor.document
        }
        sut = spy(
            TestCodePercentageTracker(
                project,
                TOTAL_SECONDS_IN_MINUTE,
                CodeWhispererPython.INSTANCE,
                mutableListOf(rangeMarkerMock1),
                mutableMapOf(fixture.editor.document to CodeCoverageTokens(totalTokens = 100, acceptedTokens = 0)),
                1
            )
        ) {
            onGeneric { extractRangeMarkerString(any()) } doReturn "fou"
            onGeneric { getAcceptedTokensDelta(any(), any()) } doReturn 1
        }
        sut.emitCodeWhispererCodeContribution()

        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, Times(1)).enqueue(metricCaptor.capture())
        CodeWhispererTelemetryTest.assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            CODE_PERCENTAGE,
            1,
            CWSPR_PERCENTAGE to "1",
            CWSPR_ACCEPTED_TOKENS to "1",
            CWSPR_TOTAL_TOKENS to "100",
            "codewhispererUserGroup" to userGroup.name,
        )
    }

    @Test
    fun `test flush() won't emit telemetry event when users not enabling telemetry`() {
        AwsSettings.getInstance().isTelemetryEnabled = false
        sut = spy(TestCodePercentageTracker(project, TOTAL_SECONDS_IN_MINUTE, CodeWhispererPython.INSTANCE))
        doNothing().whenever(sut).emitCodeWhispererCodeContribution()

        sut.activateTrackerIfNotActive()
        sut.forceTrackerFlush()

        verify(sut, Times(0)).emitCodeWhispererCodeContribution()
    }

    @Test
    fun `test getAcceptedTokensDelta()`() {
        val tracker = TestCodePercentageTracker(project, TOTAL_SECONDS_IN_MINUTE, CodeWhispererPython.INSTANCE)
        var originalRecommendation = "foo"
        var modifiedRecommendation = "fou"
        var delta = tracker.getAcceptedTokensDelta(originalRecommendation, modifiedRecommendation)
        assertThat(delta).isEqualTo(2)

        originalRecommendation = "foo"
        modifiedRecommendation = "f11111oo"
        delta = tracker.getAcceptedTokensDelta(originalRecommendation, modifiedRecommendation)
        assertThat(delta).isEqualTo(3)

        originalRecommendation = "foo"
        modifiedRecommendation = "fo"
        delta = tracker.getAcceptedTokensDelta(originalRecommendation, modifiedRecommendation)
        assertThat(delta).isEqualTo(2)

        originalRecommendation = "helloworld"
        modifiedRecommendation = "HelloWorld"
        delta = tracker.getAcceptedTokensDelta(originalRecommendation, modifiedRecommendation)
        assertThat(delta).isEqualTo("helloworld".length - 2)

        originalRecommendation = "helloworld"
        modifiedRecommendation = "World"
        delta = tracker.getAcceptedTokensDelta(originalRecommendation, modifiedRecommendation)
        assertThat(delta).isEqualTo("helloworld".length - "hello".length - 1)

        originalRecommendation = "CodeWhisperer"
        modifiedRecommendation = "CODE"
        delta = tracker.getAcceptedTokensDelta(originalRecommendation, modifiedRecommendation)
        assertThat(delta).isEqualTo(1)

        originalRecommendation = "CodeWhisperer"
        modifiedRecommendation = "codewhispererISBEST"
        delta = tracker.getAcceptedTokensDelta(originalRecommendation, modifiedRecommendation)
        assertThat(delta).isEqualTo("CodeWhisperer".length - 2)

        val pythonCommentAddedByUser = "\"\"\"we don't count this comment as generated by CodeWhisperer\"\"\"\n"
        originalRecommendation = "x, y):\n\treturn x + y"
        modifiedRecommendation = "x, y):\n$pythonCommentAddedByUser\treturn x + y"
        delta = tracker.getAcceptedTokensDelta(originalRecommendation, modifiedRecommendation)
        assertThat(delta).isEqualTo(originalRecommendation.length)
    }

    @Test
    fun `test flush() won't emit telemetry when users are not editing the document (totalTokens == 0)`() {
        sut = TestCodePercentageTracker(project, TOTAL_SECONDS_IN_MINUTE, CodeWhispererPython.INSTANCE)
        sut.activateTrackerIfNotActive()
        assertThat(sut.activeRequestCount()).isEqualTo(1)
        sut.forceTrackerFlush()
        verify(batcher, Times(0)).enqueue(any())
    }

    private fun Editor.appendString(string: String) {
        val currentOffset = caretModel.primaryCaret.offset
        document.insertString(currentOffset, string)
        caretModel.moveToOffset(currentOffset + string.length)
    }
}

internal class CodeWhispererCodeCoverageTrackerTestJava : CodeWhispererCodeCoverageTrackerTestBase(JavaCodeInsightTestFixtureRule()) {
    @Before
    override fun setup() {
        super.setup()
    }

    @Test
    fun `tracker should not update totalTokens if documentChanged events are fired by code reformatting`() {
        val codeNeedToBeReformatted = """
            class Answer {
                private int knapsack(int[] w, int[] v, int c) {
                int[][] dp = new int[w.length + 1][c + 1];
                    for (int i = 0; i < w.length; i++) {
                    for (int j = 0; j <= c; j++) {
                                   if (j < w[i]) {
                                dp[i + 1][j] = dp[i][j];
                        } 
                            else {
                      dp[i + 1][j] = Math.max(dp[i][j], dp[i][j - w[i]] + v[i]);
                            }
                        }
                                 }
                    return                  dp[w.length][c];
                }
            }            
        """.trimIndent()
        val file = fixture.configureByText("test.java", codeNeedToBeReformatted)
        sut = spy(
            TestCodePercentageTracker(
                project,
                TOTAL_SECONDS_IN_MINUTE,
                language = CodeWhispererJava.INSTANCE,
                codeCoverageTokens = mutableMapOf(fixture.editor.document to CodeCoverageTokens(totalTokens = codeNeedToBeReformatted.length))
            )
        )
        CodeWhispererCodeCoverageTracker.getInstancesMap()[CodeWhispererJava.INSTANCE] = sut
        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(project) {
                CodeStyleManager.getInstance(project).reformatText(file, 0, fixture.editor.document.textLength)
            }
        }
        // reformat should fire documentChanged events, but tracker should not update token from these events
        verify(sut, atLeastOnce()).documentChanged(any())
        assertThat(sut.totalTokensSize).isEqualTo(codeNeedToBeReformatted.length)

        val formatted = """
            class Answer {
                private int knapsack(int[] w, int[] v, int c) {
                    int[][] dp = new int[w.length + 1][c + 1];
                    for (int i = 0; i < w.length; i++) {
                        for (int j = 0; j <= c; j++) {
                            if (j < w[i]) {
                                dp[i + 1][j] = dp[i][j];
                            } else {
                                dp[i + 1][j] = Math.max(dp[i][j], dp[i][j - w[i]] + v[i]);
                            }
                        }
                    }
                    return dp[w.length][c];
                }
            }
        """.trimIndent()
        assertThat(fixture.editor.document.text.trimEnd()).isEqualTo(formatted)
    }
}
