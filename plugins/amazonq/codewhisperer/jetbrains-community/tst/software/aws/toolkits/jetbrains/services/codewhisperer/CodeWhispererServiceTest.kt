// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.psi.PsiFile
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhispererruntime.model.FileContext
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.SupplementalContext
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CaretPosition
import software.aws.toolkits.jetbrains.services.codewhisperer.model.Chunk
import software.aws.toolkits.jetbrains.services.codewhisperer.model.FileContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SupplementalContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutomatedTriggerType
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroup
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTelemetryService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileContextProvider
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererTriggerType

class CodeWhispererServiceTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private lateinit var sut: CodeWhispererService
    private lateinit var userGroupSetting: CodeWhispererUserGroupSettings
    private lateinit var customizationConfig: CodeWhispererModelConfigurator
    private lateinit var clientFacade: CodeWhispererClientAdaptor
    private lateinit var popupManager: CodeWhispererPopupManager
    private lateinit var telemetryService: CodeWhispererTelemetryService
    private lateinit var mockPopup: JBPopup
    private lateinit var file: PsiFile

    @Before
    fun setUp() {
        sut = CodeWhispererService.getInstance()
        userGroupSetting = mock {
            on { getUserGroup() } doReturn CodeWhispererUserGroup.Control
        }
        customizationConfig = mock()
        clientFacade = mock()
        mockPopup = mock<JBPopup>()
        popupManager = mock {
            on { initPopup() } doReturn mockPopup
        }

        telemetryService = mock()

        file = projectRule.fixture.addFileToProject("main.java", "public class Main {}")
        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(file.virtualFile)
        }

        ApplicationManager.getApplication().replaceService(CodeWhispererUserGroupSettings::class.java, userGroupSetting, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(CodeWhispererModelConfigurator::class.java, customizationConfig, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(CodeWhispererTelemetryService::class.java, telemetryService, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(CodeWhispererPopupManager::class.java, popupManager, disposableRule.disposable)

        projectRule.project.replaceService(CodeWhispererClientAdaptor::class.java, clientFacade, disposableRule.disposable)
        projectRule.project.replaceService(AwsConnectionManager::class.java, mock(), disposableRule.disposable)
    }

    @Test
    fun `getRequestContext should have supplementalContext and customizatioArn if they're present`() {
        whenever(userGroupSetting.getUserGroup()).thenReturn(CodeWhispererUserGroup.CrossFile)
        whenever(customizationConfig.activeCustomization(projectRule.project)).thenReturn(
            CodeWhispererCustomization(
                "fake-arn",
                "fake-name",
                ""
            )
        )

        val mockSupplementalContext = aSupplementalContextInfo(
            myContents = listOf(
                Chunk(content = "foo", path = "/foo.java"),
                Chunk(content = "bar", path = "/bar.java"),
                Chunk(content = "baz", path = "/baz.java")
            ),
            myIsUtg = false,
            myLatency = 50L
        )

        val mockFileContextProvider = mock<FileContextProvider> {
            on { this.extractFileContext(any(), any()) } doReturn aFileContextInfo()
            onBlocking { this.extractSupplementalFileContext(any(), any(), any()) } doReturn mockSupplementalContext
        }

        projectRule.project.replaceService(FileContextProvider::class.java, mockFileContextProvider, disposableRule.disposable)

        val actual = sut.getRequestContext(
            TriggerTypeInfo(CodewhispererTriggerType.OnDemand, CodeWhispererAutomatedTriggerType.Unknown()),
            projectRule.fixture.editor,
            projectRule.project,
            file,
            LatencyContext()
        )

        runTest {
            actual.awaitSupplementalContext()
        }

        assertThat(actual.customizationArn).isEqualTo("fake-arn")
        assertThat(actual.supplementalContext).isEqualTo(mockSupplementalContext)
    }

    @Ignore("need update language type since Java is fully supported")
    @Test
    fun `getRequestContext - cross file context should be empty for non-cross-file user group`() {
        whenever(userGroupSetting.getUserGroup()).thenReturn(CodeWhispererUserGroup.Control)
        val file = projectRule.fixture.addFileToProject("main.java", "public class Main {}")

        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(file.virtualFile)
        }

        val actual = sut.getRequestContext(
            TriggerTypeInfo(CodewhispererTriggerType.OnDemand, CodeWhispererAutomatedTriggerType.Unknown()),
            projectRule.fixture.editor,
            projectRule.project,
            file,
            LatencyContext()
        )

        assertThat(actual.supplementalContext).isNotNull
        assertThat(actual.supplementalContext?.contents).isEmpty()
        assertThat(actual.supplementalContext?.contentLength).isEqualTo(0)
    }

    @Test
    fun `given request context, should invoke service API with correct args and await supplemental context deferred`() = runTest {
        val mockFileContext = aFileContextInfo(CodeWhispererJava.INSTANCE)
        val mockSupContext = spy(
            aSupplementalContextInfo(
                myContents = listOf(
                    Chunk(content = "foo", path = "/foo.java"),
                    Chunk(content = "bar", path = "/bar.java"),
                    Chunk(content = "baz", path = "/baz.java")
                ),
                myIsUtg = false,
                myLatency = 50L
            )
        )

        val mockRequestContext = spy(
            RequestContext(
                project = projectRule.project,
                editor = projectRule.fixture.editor,
                triggerTypeInfo = TriggerTypeInfo(CodewhispererTriggerType.AutoTrigger, CodeWhispererAutomatedTriggerType.Enter()),
                caretPosition = CaretPosition(0, 0),
                fileContextInfo = mockFileContext,
                supplementalContextDeferred = async { mockSupContext },
                connection = ToolkitConnectionManager.getInstance(projectRule.project).activeConnection(),
                latencyContext = LatencyContext(),
                customizationArn = "fake-arn"
            )
        )

        sut.invokeCodeWhispererInBackground(mockRequestContext).join()

        verify(mockRequestContext, times(1)).awaitSupplementalContext()
        verify(clientFacade).generateCompletionsPaginator(any())

        argumentCaptor<GenerateCompletionsRequest> {
            verify(clientFacade).generateCompletionsPaginator(capture())
            assertThat(firstValue.customizationArn()).isEqualTo("fake-arn")
            assertThat(firstValue.fileContext()).isEqualTo(mockFileContext.toSdkModel())
            assertThat(firstValue.supplementalContexts()).hasSameSizeAs(mockSupContext.contents)
            assertThat(firstValue.supplementalContexts()).isEqualTo(mockSupContext.toSdkModel())
        }
    }
}

private fun CodeWhispererProgrammingLanguage.toSdkModel(): ProgrammingLanguage = ProgrammingLanguage.builder()
    .languageName(toCodeWhispererRuntimeLanguage().languageId)
    .build()

private fun FileContextInfo.toSdkModel(): FileContext = FileContext.builder()
    .filename(filename)
    .programmingLanguage(programmingLanguage.toCodeWhispererRuntimeLanguage().toSdkModel())
    .leftFileContent(caretContext.leftFileContext)
    .rightFileContent(caretContext.rightFileContext)
    .build()

private fun SupplementalContextInfo.toSdkModel(): List<SupplementalContext> = contents.map {
    SupplementalContext.builder()
        .content(it.content)
        .filePath(it.path)
        .build()
}
