// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.analysis.problemsView.toolWindow.ProblemsView
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.wm.RegisterToolWindowTask
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.impl.status.widget.StatusBarWidgetsManager
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Ignore
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.never
import org.mockito.kotlin.spy
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.core.ToolWindowHeadlessManagerImpl
import software.aws.toolkits.jetbrains.core.explorer.AwsToolkitExplorerFactory
import software.aws.toolkits.jetbrains.core.explorer.AwsToolkitExplorerToolWindow
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExploreActionState
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererConfiguration
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.status.CodeWhispererStatusBarWidgetFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceToolWindowFactory
import kotlin.test.fail

class CodeWhispererSettingsTest : CodeWhispererTestBase() {

    private lateinit var codewhispererServiceSpy: CodeWhispererService
    private lateinit var toolWindowHeadlessManager: ToolWindowHeadlessManagerImpl

    @Before
    override fun setUp() {
        super.setUp()
        codewhispererServiceSpy = spy(codewhispererService)
        ApplicationManager.getApplication().replaceService(CodeWhispererService::class.java, codewhispererServiceSpy, disposableRule.disposable)

        // Create a mock ToolWindowManager with working implementation of setAvailable() and isAvailable()
        toolWindowHeadlessManager = object : ToolWindowHeadlessManagerImpl(projectRule.project) {
            private val myToolWindows: MutableMap<String, ToolWindow> = HashMap()
            override fun doRegisterToolWindow(id: String): ToolWindow {
                val toolWindow = object : MockToolWindow(projectRule.project) {
                    private var isAvailable = false
                    override fun setAvailable(value: Boolean) {
                        isAvailable = value
                    }

                    override fun isAvailable() = isAvailable
                }
                myToolWindows[id] = toolWindow
                return toolWindow
            }

            override fun getToolWindow(id: String?): ToolWindow? {
                return myToolWindows[id]
            }
        }
        projectRule.project.replaceService(ToolWindowManager::class.java, toolWindowHeadlessManager, disposableRule.disposable)

        ToolWindowManager.getInstance(projectRule.project).registerToolWindow(
            RegisterToolWindowTask(
                id = ProblemsView.ID
            )
        )
        ToolWindowManager.getInstance(projectRule.project).registerToolWindow(
            RegisterToolWindowTask(
                id = AwsToolkitExplorerFactory.TOOLWINDOW_ID
            )
        )
        ToolWindowManager.getInstance(projectRule.project).registerToolWindow(
            RegisterToolWindowTask(
                id = CodeWhispererCodeReferenceToolWindowFactory.id
            )
        )
        projectRule.project.service<StatusBarWidgetsManager>().updateWidget(CodeWhispererStatusBarWidgetFactory::class.java)
    }

    @Test
    fun `when isCodeWhispererEnabled is false, user not able to trigger CodeWhisperer manually`() {
        whenever(stateManager.checkActiveCodeWhispererConnectionType(projectRule.project)).thenReturn(CodeWhispererLoginType.Logout)
        assertThat(isCodeWhispererEnabled(projectRule.project)).isFalse
        invokeCodeWhispererService()
        verify(codewhispererServiceSpy, never()).showRecommendationsInPopup(any(), any(), any())
    }

    @Test
    fun `test disable auto trigger should make user not able to trigger CodeWhisperer automatically`() {
        stateManager.setAutoEnabled(false)
        assertThat(stateManager.isAutoEnabled()).isFalse
        runInEdtAndWait {
            projectRule.fixture.type(':')
            verify(codewhispererServiceSpy, never()).showRecommendationsInPopup(any(), any(), any())
        }
    }

    @Test
    fun `test CodeWhisperer components should have correct states on initialization with no persistent states`() {
        mockCodeWhispererEnabledStatus(false)
        stateManager.loadState(CodeWhispererExploreActionState())
        CodeWhispererSettings.getInstance().loadState(CodeWhispererConfiguration())

        val problemsWindow = ProblemsView.getToolWindow(projectRule.project) ?: fail("Problems window not found")
        val codeReferenceWindow = ToolWindowManager.getInstance(projectRule.project).getToolWindow(
            CodeWhispererCodeReferenceToolWindowFactory.id
        ) ?: fail("Code Reference Log window not found")
        val statusBarWidgetFactory = projectRule.project.service<StatusBarWidgetsManager>().getWidgetFactories().firstOrNull {
            it.id == CodeWhispererStatusBarWidgetFactory.ID
        } ?: fail("CodeWhisperer status bar widget not found")

        runInEdtAndWait {
            assertThat(
                AwsToolkitExplorerToolWindow.toolWindow(projectRule.project)
            ).isNotNull
            assertThat(problemsWindow.contentManager.contentCount).isEqualTo(0)
            assertThat(codeReferenceWindow.isAvailable).isFalse
            assertThat(statusBarWidgetFactory.isAvailable(projectRule.project)).isTrue
            assertThat(settingsManager.isIncludeCodeWithReference()).isFalse
        }
    }

    // TODO: update this to be enable on enabling CodeWhisperer
    @Ignore
    @Test
    fun `test accept CodeWhisperer TOS will show CodeWhisperer UI components, and vice-versa`() {
        val problemsWindow = ProblemsView.getToolWindow(projectRule.project) ?: fail("Problems window not found")
        val codeReferenceWindow = ToolWindowManager.getInstance(projectRule.project).getToolWindow(
            CodeWhispererCodeReferenceToolWindowFactory.id
        ) ?: fail("Code Reference Log window not found")
        val statusBarWidgetFactory = projectRule.project.service<StatusBarWidgetsManager>().getWidgetFactories().firstOrNull {
            it.id == CodeWhispererStatusBarWidgetFactory.ID
        } ?: fail("CodeWhisperer status bar widget not found")
        val originalIsIncludeCodeWithReference = settingsManager.isIncludeCodeWithReference()

        runInEdtAndWait {
            assertThat(problemsWindow.contentManager.contentCount).isEqualTo(0)
            assertThat(codeReferenceWindow.isAvailable).isFalse
            assertThat(statusBarWidgetFactory.isAvailable(projectRule.project)).isFalse
            assertThat(settingsManager.isIncludeCodeWithReference()).isEqualTo(originalIsIncludeCodeWithReference)
        }

        runInEdtAndWait {
            assertThat(problemsWindow.contentManager.contentCount).isEqualTo(1)
            assertThat(codeReferenceWindow.isAvailable).isTrue
            assertThat(statusBarWidgetFactory.isAvailable(projectRule.project)).isTrue
            assertThat(settingsManager.isIncludeCodeWithReference()).isEqualTo(true)
        }
    }
}
