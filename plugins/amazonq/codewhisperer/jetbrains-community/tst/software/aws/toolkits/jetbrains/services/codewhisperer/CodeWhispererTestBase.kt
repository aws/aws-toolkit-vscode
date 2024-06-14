// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import org.mockito.kotlin.timeout
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.paginators.GenerateCompletionsIterable
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.codeWhispererRecommendationActionId
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testValidAccessToken
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExploreActionState
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExploreStateType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererRecommendationManager
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroup
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererConfiguration
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererConfigurationType
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.POPUP_DIM_HEX
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message

// TODO: restructure testbase, too bulky and hard to debug
open class CodeWhispererTestBase {
    var projectRule = PythonCodeInsightTestFixtureRule()
    val mockClientManagerRule = MockClientManagerRule()
    val mockCredentialRule = MockCredentialManagerRule()
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, mockCredentialRule, mockClientManagerRule, disposableRule)

    protected lateinit var mockClient: CodeWhispererRuntimeClient

    protected lateinit var popupManagerSpy: CodeWhispererPopupManager
    protected lateinit var clientAdaptorSpy: CodeWhispererClientAdaptor
    protected lateinit var invocationStatusSpy: CodeWhispererInvocationStatus
    internal lateinit var stateManager: CodeWhispererExplorerActionManager
    protected lateinit var recommendationManager: CodeWhispererRecommendationManager
    protected lateinit var codewhispererService: CodeWhispererService
    protected lateinit var editorManager: CodeWhispererEditorManager
    protected lateinit var settingsManager: CodeWhispererSettings
    private lateinit var originalExplorerActionState: CodeWhispererExploreActionState
    private lateinit var originalSettings: CodeWhispererConfiguration
    private lateinit var userGroupSettings: CodeWhispererUserGroupSettings

    @Before
    open fun setUp() {
        mockClient = mockClientManagerRule.create()
        val requestCaptor = argumentCaptor<GenerateCompletionsRequest>()
        mockClient.stub {
            on {
                mockClient.generateCompletionsPaginator(requestCaptor.capture())
            } doAnswer {
                GenerateCompletionsIterable(mockClient, requestCaptor.lastValue)
            }
        }
        mockClient.stub {
            on {
                mockClient.generateCompletions(any<GenerateCompletionsRequest>())
            } doAnswer {
                pythonResponse
            }
        }

        popupManagerSpy = spy(CodeWhispererPopupManager.getInstance())
        popupManagerSpy.reset()
        doNothing().`when`(popupManagerSpy).showPopup(any(), any(), any(), any(), any())
        ApplicationManager.getApplication().replaceService(CodeWhispererPopupManager::class.java, popupManagerSpy, disposableRule.disposable)

        invocationStatusSpy = spy(CodeWhispererInvocationStatus.getInstance())
        invocationStatusSpy.stub {
            on {
                hasEnoughDelayToShowCodeWhisperer()
            } doAnswer {
                true
            }
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererInvocationStatus::class.java, invocationStatusSpy, disposableRule.disposable)

        stateManager = spy(CodeWhispererExplorerActionManager.getInstance())
        recommendationManager = CodeWhispererRecommendationManager.getInstance()
        codewhispererService = CodeWhispererService.getInstance()
        editorManager = CodeWhispererEditorManager.getInstance()
        settingsManager = CodeWhispererSettings.getInstance()

        setFileContext(pythonFileName, pythonTestLeftContext, "")

        originalExplorerActionState = stateManager.state
        originalSettings = settingsManager.state
        stateManager.loadState(
            CodeWhispererExploreActionState().apply {
                CodeWhispererExploreStateType.values().forEach {
                    value[it] = true
                }
                token = testValidAccessToken
            }
        )
        stateManager.stub {
            onGeneric {
                checkActiveCodeWhispererConnectionType(any())
            } doAnswer {
                CodeWhispererLoginType.Sono
            }
        }
        settingsManager.loadState(
            CodeWhispererConfiguration().apply {
                value[CodeWhispererConfigurationType.IsIncludeCodeWithReference] = true
            }
        )

        clientAdaptorSpy = spy(CodeWhispererClientAdaptor.getInstance(projectRule.project))
        projectRule.project.replaceService(CodeWhispererClientAdaptor::class.java, clientAdaptorSpy, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(CodeWhispererExplorerActionManager::class.java, stateManager, disposableRule.disposable)
        stateManager.setAutoEnabled(false)

        userGroupSettings = mock { on { getUserGroup() } doReturn CodeWhispererUserGroup.Control }
        ApplicationManager.getApplication().replaceService(CodeWhispererUserGroupSettings::class.java, userGroupSettings, disposableRule.disposable)
    }

    @After
    open fun tearDown() {
        stateManager.loadState(originalExplorerActionState)
        settingsManager.loadState(originalSettings)
        popupManagerSpy.reset()
        runInEdtAndWait {
            popupManagerSpy.closePopup()
        }
    }

    fun withCodeWhispererServiceInvokedAndWait(runnable: (InvocationContext) -> Unit) {
        val statesCaptor = argumentCaptor<InvocationContext>()
        invokeCodeWhispererService()
        verify(popupManagerSpy, timeout(5000).atLeastOnce())
            .showPopup(statesCaptor.capture(), any(), any(), any(), any())
        val states = statesCaptor.lastValue

        runInEdtAndWait {
            try {
                runnable(states)
            } finally {
                CodeWhispererPopupManager.getInstance().closePopup(states.popup)
            }
        }

        // To make sure the previous runnable on EDT thread is complete before the test proceeds
        runInEdtAndWait {}
    }

    fun invokeCodeWhispererService() {
        runInEdtAndWait {
            projectRule.fixture.performEditorAction(codeWhispererRecommendationActionId)
        }
        while (CodeWhispererInvocationStatus.getInstance().hasExistingInvocation()) {
            Thread.sleep(10)
        }
    }

    fun checkRecommendationInfoLabelText(selected: Int, total: Int) {
        // should show "[selected] of [total]"
        val actual = popupManagerSpy.popupComponents.recommendationInfoLabel.text
        val expected = message("codewhisperer.popup.recommendation_info", selected, total, POPUP_DIM_HEX)
        assertThat(actual).isEqualTo(expected)
    }

    fun setFileContext(filename: String, leftContext: String, rightContext: String) {
        projectRule.fixture.configureByText(filename, leftContext + rightContext)
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.primaryCaret.moveToOffset(leftContext.length)
        }
    }

    fun mockCodeWhispererEnabledStatus(enabled: Boolean) {
        stateManager.stub {
            onGeneric {
                checkActiveCodeWhispererConnectionType(any())
            } doAnswer {
                if (enabled) CodeWhispererLoginType.Sono else CodeWhispererLoginType.Logout
            }
        }
    }
}
