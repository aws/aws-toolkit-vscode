// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.analysis.problemsView.toolWindow.ProblemsView
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.wm.RegisterToolWindowTask
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.psi.PsiFile
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.spy
import org.mockito.kotlin.timeout
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.jetbrains.core.MockClientManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.codeWhispererRecommendationActionId
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeScanResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanException
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanIssue
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExploreActionState
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExploreStateType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CodeScanTelemetryEvent
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererConfiguration
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererConfigurationType
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTelemetryService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.RunWithRealCredentials

open class CodeWhispererIntegrationTestBase(val projectRule: CodeInsightTestFixtureRule = PythonCodeInsightTestFixtureRule()) {

    private val realCredentials = RunWithRealCredentials(projectRule)
    internal val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule, realCredentials)

    protected lateinit var popupManager: CodeWhispererPopupManager
    protected lateinit var clientAdaptor: CodeWhispererClientAdaptor
    protected lateinit var stateManager: CodeWhispererExplorerActionManager
    protected lateinit var codewhispererService: CodeWhispererService
    protected lateinit var settingsManager: CodeWhispererSettings
    private lateinit var originalExplorerActionState: CodeWhispererExploreActionState
    private lateinit var originalSettings: CodeWhispererConfiguration
    internal lateinit var scanManager: CodeWhispererCodeScanManager
    protected lateinit var telemetryServiceSpy: CodeWhispererTelemetryService

    @Suppress("UnreachableCode")
    @Before
    open fun setUp() {
        assumeTrue("CI doesn't have Builder ID credentials", System.getenv("CI").isNullOrBlank())
        MockClientManager.useRealImplementations(disposableRule.disposable)

        loginSso(projectRule.project, SONO_URL, SONO_REGION, Q_SCOPES)
        val connectionId = ToolkitBearerTokenProvider.ssoIdentifier(SONO_URL)
        val connection = ToolkitAuthManager.getInstance().getConnection(connectionId) ?: return
        val tokenProvider = (connection.getConnectionSettings() as TokenConnectionSettings).tokenProvider.delegate as BearerTokenProvider
        tokenProvider.resolveToken()

        ToolWindowManager.getInstance(projectRule.project).registerToolWindow(
            RegisterToolWindowTask(id = ProblemsView.ID, canWorkInDumbMode = true)
        )

        scanManager = spy(CodeWhispererCodeScanManager.getInstance(projectRule.project))
        doNothing().whenever(scanManager).addCodeScanUI(any())
        projectRule.project.replaceService(CodeWhispererCodeScanManager::class.java, scanManager, disposableRule.disposable)

        telemetryServiceSpy = spy(CodeWhispererTelemetryService.getInstance())
        ApplicationManager.getApplication().replaceService(CodeWhispererTelemetryService::class.java, telemetryServiceSpy, disposableRule.disposable)

        stateManager = CodeWhispererExplorerActionManager.getInstance()
        stateManager.setAutoEnabled(false)

        popupManager = spy(CodeWhispererPopupManager.getInstance())
        popupManager.reset()
        doNothing().whenever(popupManager).showPopup(any(), any(), any(), any(), any())
        ApplicationManager.getApplication().replaceService(CodeWhispererPopupManager::class.java, popupManager, disposableRule.disposable)

        codewhispererService = spy(CodeWhispererService.getInstance())
        ApplicationManager.getApplication().replaceService(CodeWhispererService::class.java, codewhispererService, disposableRule.disposable)

        settingsManager = CodeWhispererSettings.getInstance()

        clientAdaptor = spy(CodeWhispererClientAdaptor.getInstance(projectRule.project))
        projectRule.project.replaceService(CodeWhispererClientAdaptor::class.java, clientAdaptor, disposableRule.disposable)

        originalExplorerActionState = stateManager.state
        originalSettings = settingsManager.state
        stateManager.loadState(
            CodeWhispererExploreActionState().apply {
                CodeWhispererExploreStateType.values().forEach {
                    value[it] = true
                }
            }
        )
        settingsManager.loadState(
            CodeWhispererConfiguration().apply {
                value[CodeWhispererConfigurationType.IsIncludeCodeWithReference] = true
            }
        )

        setFileContext(pythonFileName, pythonTestLeftContext, "")
    }

    @After
    open fun tearDown() {
        runInEdtAndWait {
            if (::stateManager.isInitialized) {
                stateManager.loadState(originalExplorerActionState)
            }

            if (::settingsManager.isInitialized) {
                settingsManager.loadState(originalSettings)
            }

            if (::popupManager.isInitialized) {
                popupManager.reset()
            }
        }
    }

    fun withCodeWhispererServiceInvokedAndWait(manual: Boolean = true, runnable: (GenerateCompletionsResponse) -> Unit) {
        val responseCaptor = argumentCaptor<GenerateCompletionsResponse>()
        val statesCaptor = argumentCaptor<InvocationContext>()
        invokeCodeWhispererService(manual)
        verify(codewhispererService, timeout(5000).atLeastOnce()).validateResponse(responseCaptor.capture())
        val response = responseCaptor.lastValue
        verify(popupManager, timeout(5000).atLeastOnce()).showPopup(statesCaptor.capture(), any(), any(), any(), any())
        val states = statesCaptor.lastValue

        runInEdtAndWait {
            try {
                runnable(response)
            } finally {
                CodeWhispererPopupManager.getInstance().closePopup(states.popup)
            }
        }
    }

    fun invokeCodeWhispererService(manual: Boolean = true) {
        if (manual) {
            runInEdtAndWait {
                projectRule.fixture.performEditorAction(codeWhispererRecommendationActionId)
            }
        } else {
            runInEdtAndWait {
                projectRule.fixture.type('(')
            }
        }
        while (CodeWhispererInvocationStatus.getInstance().hasExistingInvocation()) {
            Thread.sleep(10)
        }
    }

    fun setFileContext(filename: String, leftContext: String, rightContext: String): PsiFile {
        val file = projectRule.fixture.configureByText(filename, leftContext + rightContext)
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.primaryCaret.moveToOffset(leftContext.length)
        }
        return file
    }

    fun runCodeScan(success: Boolean = true): CodeScanResponse {
        runInEdtAndWait {
            projectRule.fixture.performEditorAction(CodeWhispererTestUtil.codeWhispererCodeScanActionId)
        }
        val issuesCaptor = argumentCaptor<List<CodeWhispererCodeScanIssue>>()
        val codeScanEventCaptor = argumentCaptor<CodeScanTelemetryEvent>()
        return runBlocking {
            var issues = emptyList<CodeWhispererCodeScanIssue>()
            if (success) {
                verify(
                    scanManager,
                    timeout(60000).atLeastOnce()
                ).renderResponseOnUIThread(issuesCaptor.capture(), any(), CodeWhispererConstants.CodeAnalysisScope.PROJECT)
                issues = issuesCaptor.lastValue
            }
            verify(telemetryServiceSpy, timeout(60000).atLeastOnce()).sendSecurityScanEvent(codeScanEventCaptor.capture(), anyOrNull())
            val codeScanResponseContext = codeScanEventCaptor.lastValue.codeScanResponseContext
            CodeScanResponse.Success(issues, codeScanResponseContext)
        }
    }

    fun testCodeScanWithErrorMessage(message: String) {
        val response = runCodeScan(success = false)
        assertThat(response.issues.size).isEqualTo(0)
        assertThat(response.responseContext.codeScanTotalIssues).isEqualTo(0)
        assertThat(response.responseContext.codeScanJobId).isNull()
        val exceptionCaptor = argumentCaptor<Exception>()
        verify(scanManager, atLeastOnce()).handleException(any(), exceptionCaptor.capture(), CodeWhispererConstants.CodeAnalysisScope.PROJECT)
        val e = exceptionCaptor.lastValue
        assertThat(e is CodeWhispererCodeScanException).isTrue
        assertThat(e.message).isEqualTo(message)
    }

    fun testMessageShown(message: String, info: Boolean = true) {
        val messageCaptor = argumentCaptor<String>()
        if (info) {
            verify(codewhispererService, timeout(5000).times(1))
                .showCodeWhispererInfoHint(any(), messageCaptor.capture())
        } else {
            verify(codewhispererService, timeout(5000).times(1))
                .showCodeWhispererErrorHint(any(), messageCaptor.capture())
        }
        assertThat(messageCaptor.lastValue).isEqualTo(message)
    }
}
