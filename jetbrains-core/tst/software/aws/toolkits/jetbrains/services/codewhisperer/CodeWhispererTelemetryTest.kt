// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.psi.PsiDocumentManager
import com.intellij.testFramework.TestActionEvent
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
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doReturnConsecutively
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import org.mockito.kotlin.timeout
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.emptyListResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.keystrokeInput
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.listOfEmptyRecommendationResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.listOfMixedEmptyAndNonEmptyRecommendationResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponseWithNonEmptyToken
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testCodeWhispererException
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testRequestId
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testRequestIdForCodeWhispererException
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testSessionId
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Pause
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Resume
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.PauseCodeWhispererNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.ResumeCodeWhispererNode
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.AcceptedSuggestionEntry
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererCodeCoverageTracker
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererUserModificationTracker
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CaretMovement
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
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
    private val codePercentage = "codewhisperer_codePercentage"
    private val awsModifySetting = "aws_modifySetting"
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
            onGeneric { getRequestContext(any(), any(), any(), any(), any()) }
                .doAnswer { throw Exception() }
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererService::class.java, codewhispererServiceSpy, disposableRule.disposable)

        invokeCodeWhispererService()

        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            assertEventsContainsFieldsAndCount(
                allValues,
                serviceInvocation,
                1,
                "result" to Result.Failed.toString()
            )
        }
    }

    @Test
    fun `test accepting recommendation will send user modification events with 1 accepted other unseen`() {
        val trackerSpy = spy(CodeWhispererUserModificationTracker.getInstance(projectRule.project))
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
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
                "",
                null
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
            popupManagerSpy.popupComponents.acceptButton.doClick()
        }

        trackerSpy.dispose()
        val count = pythonResponse.completions().size
        argumentCaptor<MetricEvent>().apply {
            // 1 serviceInvocation + 1 userModification + 1 userDecision for accepted +
            // (count - 1) userDecisions for ignored
            verify(batcher, atLeast(2 + count)).enqueue(capture())
            assertEventsContainsFieldsAndCount(allValues, serviceInvocation, 1)
            assertEventsContainsFieldsAndCount(
                allValues,
                userModification,
                1,
                "codewhispererSessionId" to testSessionId,
                "codewhispererUserGroup" to userGroup.name,
            )
            assertEventsContainsFieldsAndCount(
                allValues,
                userDecision,
                1,
                codewhispererSuggestionState to CodewhispererSuggestionState.Accept.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
            assertEventsContainsFieldsAndCount(
                allValues,
                userDecision,
                count - 1,
                codewhispererSuggestionState to CodewhispererSuggestionState.Unseen.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
        }
    }

    @Test
    fun `test cancelling popup will send user decision event for all unseen but one rejected`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        withCodeWhispererServiceInvokedAndWait { states ->
            popupManagerSpy.cancelPopup(states.popup)

            val count = pythonResponse.completions().size
            argumentCaptor<MetricEvent>().apply {
                verify(batcher, atLeast(1 + count)).enqueue(capture())
                assertEventsContainsFieldsAndCount(
                    allValues,
                    serviceInvocation,
                    1,
                    "result" to Result.Succeeded.toString(),
                    "codewhispererUserGroup" to userGroup.name,
                )
                assertEventsContainsFieldsAndCount(
                    allValues,
                    userDecision,
                    1,
                    codewhispererSuggestionState to CodewhispererSuggestionState.Reject.toString(),
                    "codewhispererUserGroup" to userGroup.name,
                )
                assertEventsContainsFieldsAndCount(
                    allValues,
                    userDecision,
                    count - 1,
                    codewhispererSuggestionState to CodewhispererSuggestionState.Unseen.toString(),
                    "codewhispererUserGroup" to userGroup.name,
                )
            }
        }
    }

    @Test
    fun `test invoking CodeWhisperer will send service invocation event with succeeded status`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        withCodeWhispererServiceInvokedAndWait {
            argumentCaptor<MetricEvent>().apply {
                verify(batcher, atLeastOnce()).enqueue(capture())
                assertEventsContainsFieldsAndCount(
                    allValues,
                    serviceInvocation,
                    1,
                    "result" to Result.Succeeded.toString(),
                    "codewhispererUserGroup" to userGroup.name,
                )
            }
        }
    }

    @Test
    fun `test moving caret backwards before getting back response will send user decision events for all discarded`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
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

        val count = pythonResponse.completions().size
        runInEdtAndWait {
            argumentCaptor<MetricEvent>().apply {
                verify(batcher, atLeast(1 + count)).enqueue(capture())
                assertEventsContainsFieldsAndCount(
                    allValues,
                    serviceInvocation,
                    1,
                    "result" to Result.Succeeded.toString(),
                    "codewhispererUserGroup" to userGroup.name,
                )
                assertEventsContainsFieldsAndCount(
                    allValues,
                    userDecision,
                    count,
                    codewhispererSuggestionState to CodewhispererSuggestionState.Discard.toString(),
                    "codewhispererUserGroup" to userGroup.name,
                )
            }
        }
    }

    @Test
    fun `test user's typeahead before getting response will discard recommendations whose prefix not matching`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
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
        val prefixNotMatchCount = pythonResponse.completions().filter {
            !it.content().startsWith(typeahead)
        }.size
        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeast(1 + prefixNotMatchCount)).enqueue(capture())
            assertEventsContainsFieldsAndCount(
                allValues,
                serviceInvocation,
                1,
                "result" to Result.Succeeded.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
            assertEventsContainsFieldsAndCount(
                allValues,
                userDecision,
                prefixNotMatchCount,
                codewhispererSuggestionState to CodewhispererSuggestionState.Discard.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
        }
    }

    @Test
    fun `test getting non-CodeWhisperer Exception will return empty request id`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        mockClient.stub {
            on {
                this.generateCompletions(any<GenerateCompletionsRequest>())
            } doAnswer {
                throw Exception("wrong path")
            }
        }

        invokeCodeWhispererService()

        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            assertEventsContainsFieldsAndCount(
                allValues,
                serviceInvocation,
                1,
                "codewhispererRequestId" to "",
                "result" to Result.Failed.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
        }
    }

    @Test
    fun `test getting CodeWhispererException will capture request id`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        mockClient.stub {
            on {
                this.generateCompletions(any<GenerateCompletionsRequest>())
            } doAnswer {
                throw testCodeWhispererException
            }
        }

        invokeCodeWhispererService()

        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            assertEventsContainsFieldsAndCount(
                allValues,
                serviceInvocation,
                1,
                "codewhispererRequestId" to testRequestIdForCodeWhispererException,
                "result" to Result.Failed.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
        }
    }

    @Test
    fun `test user Decision events record CodeWhisperer reference info`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        withCodeWhispererServiceInvokedAndWait {}
        val mapper = jacksonObjectMapper()
        argumentCaptor<MetricEvent>().apply {
            verify(batcher, atLeastOnce()).enqueue(capture())
            pythonResponse.completions().forEach {
                assertEventsContainsFieldsAndCount(
                    allValues,
                    userDecision,
                    1,
                    "codewhispererSuggestionReferences" to mapper.writeValueAsString(it.references().map { ref -> ref.licenseName() }.toSet()),
                    "codewhispererSuggestionReferenceCount" to it.references().size.toString(),
                    "codewhispererUserGroup" to userGroup.name,
                    atLeast = true
                )
            }
        }
    }

    @Test
    fun `test invoking CodeWhisperer will send service invocation event with sessionId and requestId from response`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        withCodeWhispererServiceInvokedAndWait { states ->
            val metricCaptor = argumentCaptor<MetricEvent>()
            verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
            assertEventsContainsFieldsAndCount(
                metricCaptor.allValues,
                serviceInvocation,
                1,
                "codewhispererSessionId" to states.responseContext.sessionId,
                "codewhispererRequestId" to states.recommendationContext.details[0].requestId,
                "codewhispererUserGroup" to userGroup.name,
            )
        }
    }

    @Test
    fun `test userDecision events will record sessionId and requestId from response`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        val statesCaptor = argumentCaptor<InvocationContext>()
        withCodeWhispererServiceInvokedAndWait {}
        verify(popupManagerSpy, timeout(5000).atLeastOnce()).render(statesCaptor.capture(), any(), any(), any(), any())
        val states = statesCaptor.lastValue
        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            userDecision,
            states.recommendationContext.details.size,
            "codewhispererSessionId" to states.responseContext.sessionId,
            "codewhispererRequestId" to states.recommendationContext.details[0].requestId,
            "codewhispererUserGroup" to userGroup.name,
        )
    }

    @Test
    fun `test showing IntelliSense after triggering CodeWhisperer will send userDecision events of state Discard`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        val codewhispererServiceSpy = spy(codewhispererService)
        codewhispererServiceSpy.stub {
            onGeneric {
                canDoInvocation(any(), any())
            } doAnswer {
                true
            }
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererService::class.java, codewhispererServiceSpy, disposableRule.disposable)
        popupManagerSpy.stub {
            onGeneric {
                hasConflictingPopups(any())
            } doAnswer {
                true
            }
        }
        invokeCodeWhispererService()

        runInEdtAndWait {
            val metricCaptor = argumentCaptor<MetricEvent>()
            verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
            assertEventsContainsFieldsAndCount(
                metricCaptor.allValues,
                userDecision,
                pythonResponse.completions().size,
                codewhispererSuggestionState to CodewhispererSuggestionState.Discard.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
        }
    }

    @Test
    fun `test codePercentage tracker will not be activated if CWSPR terms of service is not accepted`() {
        val exploreManagerMock = mock<CodeWhispererExplorerActionManager> {
            on { checkActiveCodeWhispererConnectionType(projectRule.project) } doReturn CodeWhispererLoginType.Logout
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererExplorerActionManager::class.java, exploreManagerMock, disposableRule.disposable)
        val project = projectRule.project
        val fixture = projectRule.fixture
        val tracker = CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererPython.INSTANCE)
        assertThat(tracker.isTrackerActive()).isFalse
        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString("arbitrary string to trigger documentChanged")
            }
        }
        assertThat(tracker.isTrackerActive()).isFalse
    }

    @Test
    fun `test codePercentage tracker will not be initialized with unsupportedLanguage`() {
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(0)
        val project = projectRule.project
        val fixture = projectRule.fixture
        val plainTxtFile = fixture.addFileToProject("/notSupported.txt", "")

        runInEdtAndWait {
            fixture.openFileInEditor(plainTxtFile.virtualFile)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString("random txt string")
            }
        }

        // document changes in unsupported files will not trigger initialization of tracker
        assertThat(CodeWhispererCodeCoverageTracker.getInstancesMap()).hasSize(0)
    }

    @Test
    fun `test codePercentage metric is correct - 1`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        val project = projectRule.project
        val fixture = projectRule.fixture
        val emptyFile = fixture.addFileToProject("/anotherFile.py", "")
        // simulate users typing behavior of the following
        // user hit one key stroke
        runInEdtAndWait {
            fixture.openFileInEditor(emptyFile.virtualFile)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(keystrokeInput)
            }
        }
        // simulate users accepting the recommendation and delete part of the recommendation
        // (x, y):\n    return x + y
        val deletedTokenByUser = 4
        withCodeWhispererServiceInvokedAndWait {
            popupManagerSpy.popupComponents.acceptButton.doClick()
        }

        runInEdtAndWait {
            val offset = fixture.caretOffset
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.document.deleteString(offset - deletedTokenByUser, offset)
                fixture.editor.caretModel.moveToOffset(fixture.editor.document.textLength)
            }
        }

        CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererPython.INSTANCE).dispose()

        val acceptedTokensSize = pythonResponse.completions()[0].content().length - deletedTokenByUser
        val totalTokensSize = keystrokeInput.length + pythonResponse.completions()[0].content().length

        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            codePercentage,
            1,
            "codewhispererAcceptedTokens" to acceptedTokensSize.toString(),
            "codewhispererTotalTokens" to totalTokensSize.toString(),
            "codewhispererPercentage" to CodeWhispererCodeCoverageTracker.calculatePercentage(acceptedTokensSize, totalTokensSize).toString(),
            "codewhispererUserGroup" to userGroup.name,
        )
    }

    @Test
    fun `test codePercentage metric is correct - 2`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        val project = projectRule.project
        val fixture = projectRule.fixture
        val emptyFile = fixture.addFileToProject("/anotherFile.py", "")
        // simulate users typing behavior
        runInEdtAndWait {
            fixture.openFileInEditor(emptyFile.virtualFile)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(keystrokeInput)
            }
        }
        // simulate users accepting the recommendation
        // (x, y):\n    return x + y
        val anotherKeyStrokeInput = "\n  "
        withCodeWhispererServiceInvokedAndWait {
            popupManagerSpy.popupComponents.acceptButton.doClick()
        }

        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(anotherKeyStrokeInput)
                val currentOffset = fixture.editor.caretModel.offset
                // delete 1 char
                fixture.editor.document.deleteString(currentOffset - 1, currentOffset)
            }
            // use dispose() to force tracker to emit telemetry
            CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererPython.INSTANCE).dispose()
        }

        val acceptedTokensSize = pythonResponse.completions()[0].content().length
        val totalTokensSize = keystrokeInput.length + pythonResponse.completions()[0].content().length + 1

        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            codePercentage,
            1,
            "codewhispererAcceptedTokens" to acceptedTokensSize.toString(),
            "codewhispererTotalTokens" to totalTokensSize.toString(),
            "codewhispererPercentage" to CodeWhispererCodeCoverageTracker.calculatePercentage(acceptedTokensSize, totalTokensSize).toString(),
            "codewhispererUserGroup" to userGroup.name,
        )
    }

    /**
     * When user accept recommendation in file1, then switch and delete code in file2, if the deletion code in file2 is on pre-existing code,
     * we should not decrement totalTokens by the length of the code deleted
     */
    @Test
    fun `test codePercentage metric - switching files and delete tokens`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        val project = projectRule.project
        val fixture = projectRule.fixture
        val emptyFile = fixture.addFileToProject("/anotherFile.py", pythonTestLeftContext)
        // simulate users typing behavior
        runInEdtAndWait {
            fixture.openFileInEditor(emptyFile.virtualFile)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString(keystrokeInput)
            }
        }

        // accept recommendation in file1.py
        withCodeWhispererServiceInvokedAndWait {
            popupManagerSpy.popupComponents.acceptButton.doClick()
        }

        val file2 = fixture.addFileToProject("./file2.py", "Pre-existing string")
        // switch to file2.py and delete code there
        runInEdtAndWait {
            fixture.openFileInEditor(file2.virtualFile)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.document.deleteString(0, file2.textLength)
            }
        }

        // use dispose() to force tracker to emit telemetry
        CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererPython.INSTANCE).dispose()

        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            codePercentage,
            1,
            "codewhispererAcceptedTokens" to pythonResponse.completions()[0].content().length.toString(),
            "codewhispererTotalTokens" to (1 + pythonResponse.completions()[0].content().length).toString(),
            "codewhispererPercentage" to "96",
            "codewhispererUserGroup" to userGroup.name,
        )
    }

    @Test
    fun `test codePercentage metric is correct - simulate IDE adding right closing paren`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        val project = projectRule.project
        val fixture = projectRule.fixture
        val emptyFile = fixture.addFileToProject("/anotherFile.py", "")
        // simulate users typing behavior of the following
        // def addTwoNumbers(
        whenever(mockClient.generateCompletions(any<GenerateCompletionsRequest>())).thenReturn(
            GenerateCompletionsResponse.builder()
                .completions(
                    CodeWhispererTestUtil.generateMockCompletionDetail("x, y):\n    return x + y"),
                    CodeWhispererTestUtil.generateMockCompletionDetail("a, b):\n    return a + b"),
                )
                .nextToken("")
                .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(ResponseMetadata.AWS_REQUEST_ID to testRequestId)))
                .sdkHttpResponse(SdkHttpResponse.builder().headers(mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))).build())
                .build() as GenerateCompletionsResponse
        )

        runInEdtAndWait {
            fixture.openFileInEditor(emptyFile.virtualFile)
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.appendString("(")
                // add closing paren but not move the caret position, simulating IDE's behavior
                fixture.editor.document.insertString(fixture.editor.caretModel.offset, ")")
            }
        }

        withCodeWhispererServiceInvokedAndWait {
            popupManagerSpy.popupComponents.acceptButton.doClick()
        }
        CodeWhispererCodeCoverageTracker.getInstance(project, CodeWhispererPython.INSTANCE).dispose()

        val acceptedTokensSize = "x, y):\n    return x + y".length
        val totalTokensSize = "()".length + acceptedTokensSize
        val metricCaptor = argumentCaptor<MetricEvent>()
        verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            codePercentage,
            1,
            "codewhispererAcceptedTokens" to acceptedTokensSize.toString(),
            "codewhispererTotalTokens" to totalTokensSize.toString(),
            "codewhispererPercentage" to CodeWhispererCodeCoverageTracker.calculatePercentage(acceptedTokensSize, totalTokensSize).toString(),
            "codewhispererUserGroup" to userGroup.name,
        )
    }

    @Test
    fun `test empty list of recommendations should sent 1 empty userDecision event and no popup shown`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        mockClient.stub {
            on {
                mockClient.generateCompletions(any<GenerateCompletionsRequest>())
            } doAnswer {
                emptyListResponse
            }
        }
        invokeCodeWhispererService()

        verify(popupManagerSpy, never()).showPopup(any(), any(), any(), any(), any())
        runInEdtAndWait {
            val metricCaptor = argumentCaptor<MetricEvent>()
            verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
            assertEventsContainsFieldsAndCount(
                metricCaptor.allValues,
                userDecision,
                1,
                "codewhispererSuggestionState" to CodewhispererSuggestionState.Empty.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
        }
    }

    @Test
    fun `test getting some recommendations and a final empty list of recommendations at session end should not sent empty userDecision events`() {
        val userGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup()
        mockClient.stub {
            on {
                mockClient.generateCompletions(any<GenerateCompletionsRequest>())
            } doReturnConsecutively(listOf(pythonResponseWithNonEmptyToken, emptyListResponse))
        }

        withCodeWhispererServiceInvokedAndWait { }

        runInEdtAndWait {
            val metricCaptor = argumentCaptor<MetricEvent>()
            // 2 serviceInvocation + 5 userDecision
            verify(batcher, atLeast(pythonResponseWithNonEmptyToken.completions().size + 2)).enqueue(metricCaptor.capture())
            assertEventsContainsFieldsAndCount(
                metricCaptor.allValues,
                userDecision,
                0,
                "codewhispererSuggestionState" to CodewhispererSuggestionState.Empty.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
            assertEventsContainsFieldsAndCount(
                metricCaptor.allValues,
                userDecision,
                1,
                "codewhispererSuggestionState" to CodewhispererSuggestionState.Accept.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
            assertEventsContainsFieldsAndCount(
                metricCaptor.allValues,
                userDecision,
                4,
                "codewhispererSuggestionState" to CodewhispererSuggestionState.Unseen.toString(),
                "codewhispererUserGroup" to userGroup.name,
            )
        }
    }

    @Test
    fun `test empty recommendations should send empty user decision events`() {
        testSendEmptyUserDecisionEventForEmptyRecommendations(listOfEmptyRecommendationResponse)
    }

    @Test
    fun `test a mix of empty and non-empty recommendations should send empty user decision events accordingly`() {
        testSendEmptyUserDecisionEventForEmptyRecommendations(listOfMixedEmptyAndNonEmptyRecommendationResponse)
    }

    @Test
    fun `test toggle autoSugestion will emit autoSuggestionActivation telemetry (explorer)`() {
        val metricCaptor = argumentCaptor<MetricEvent>()
        doNothing().`when`(batcher).enqueue(metricCaptor.capture())

        PauseCodeWhispererNode(projectRule.project).onDoubleClick(mock())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            awsModifySetting,
            1,
            "settingId" to CodeWhispererConstants.AutoSuggestion.SETTING_ID,
            "settingState" to CodeWhispererConstants.AutoSuggestion.DEACTIVATED
        )

        ResumeCodeWhispererNode(projectRule.project).onDoubleClick(mock())
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            awsModifySetting,
            1,
            "settingId" to CodeWhispererConstants.AutoSuggestion.SETTING_ID,
            "settingState" to CodeWhispererConstants.AutoSuggestion.ACTIVATED
        )
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            awsModifySetting,
            2,
        )
    }

    @Test
    fun `test toggle autoSugestion will emit autoSuggestionActivation telemetry (popup)`() {
        val metricCaptor = argumentCaptor<MetricEvent>()
        doNothing().`when`(batcher).enqueue(metricCaptor.capture())

        Pause().actionPerformed(TestActionEvent { projectRule.project })
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            awsModifySetting,
            1,
            "settingId" to CodeWhispererConstants.AutoSuggestion.SETTING_ID,
            "settingState" to CodeWhispererConstants.AutoSuggestion.DEACTIVATED
        )

        Resume().actionPerformed(TestActionEvent { projectRule.project })
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            awsModifySetting,
            1,
            "settingId" to CodeWhispererConstants.AutoSuggestion.SETTING_ID,
            "settingState" to CodeWhispererConstants.AutoSuggestion.ACTIVATED
        )
        assertEventsContainsFieldsAndCount(
            metricCaptor.allValues,
            awsModifySetting,
            2,
        )
    }

    private fun testSendEmptyUserDecisionEventForEmptyRecommendations(response: GenerateCompletionsResponse) {
        mockClient.stub {
            on {
                mockClient.generateCompletions(any<GenerateCompletionsRequest>())
            } doAnswer {
                response
            }
        }

        invokeCodeWhispererService()

        val numOfEmptyRecommendations = response.completions().filter { it.content().isEmpty() }.size
        if (numOfEmptyRecommendations == response.completions().size) {
            verify(popupManagerSpy, never()).showPopup(any(), any(), any(), any(), any())
        } else {
            val popupCaptor = argumentCaptor<JBPopup>()
            verify(popupManagerSpy, timeout(5000))
                .showPopup(any(), any(), popupCaptor.capture(), any(), any())
            runInEdtAndWait {
                popupManagerSpy.closePopup(popupCaptor.lastValue)
            }
        }
        runInEdtAndWait {
            val metricCaptor = argumentCaptor<MetricEvent>()
            verify(batcher, atLeastOnce()).enqueue(metricCaptor.capture())
            assertEventsContainsFieldsAndCount(
                metricCaptor.allValues,
                userDecision,
                numOfEmptyRecommendations,
                "codewhispererSuggestionState" to CodewhispererSuggestionState.Empty.toString(),
                "codewhispererCompletionType" to CodewhispererCompletionType.Line.toString()
            )
        }
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
        // TODO: move this to util and tweak it to show what telemetry field not matching assertions
        fun assertEventsContainsFieldsAndCount(
            events: Collection<MetricEvent>,
            name: String,
            count: Int,
            vararg keyValues: Pair<String, Any?>,
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

        private fun isThisMapContains(map: Map<String, String>, vararg keyValues: Pair<String, Any?>): Boolean {
            keyValues.forEach { pair ->
                val fieldName = pair.first
                val expectedValue = pair.second
                expectedValue?.let {
                    if (it.toString() != map[fieldName]) {
                        return false
                    }
                }
            }
            return true
        }
    }
}
