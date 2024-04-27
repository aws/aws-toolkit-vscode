// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.ide.browsers.BrowserLauncher
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.testFramework.TestActionEvent
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.spy
import org.mockito.Mockito.verify
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.eq
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererLearnMoreAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererShowSettingsAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererWhatIsAction
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererConfigurable
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import java.net.URI

class CodeWhispererActionTest : CodeWhispererTestBase() {
    private lateinit var browserLauncherSpy: BrowserLauncher
    private lateinit var event: AnActionEvent

    @Before
    override fun setUp() {
        super.setUp()
        browserLauncherSpy = mock(BrowserLauncher::class.java)
        event = TestActionEvent { key ->
            when (key) {
                CommonDataKeys.PROJECT.name -> projectRule.project
                else -> null
            }
        }
        ApplicationManager.getApplication().replaceService(BrowserLauncher::class.java, browserLauncherSpy, disposableRule.disposable)
    }

    @Test
    fun `CodeWhispererLearnMoreAction actionPerformed should open correct URI`() {
        val action = CodeWhispererLearnMoreAction()
        testBrowserActionHelper(action, CodeWhispererConstants.Q_MARKETPLACE_URI)
    }

    @Test
    fun `CodeWhispererWhatIsAction update should be enabled and visible when terms of service have been accepted`() {
        val action = CodeWhispererWhatIsAction()
        mockCodeWhispererEnabledStatus(true)
        action.update(event)
        assertThat(event.presentation.isEnabledAndVisible).isTrue
    }

    @Test
    fun `CodeWhispererWhatIsAction update should be disabled and invisible when terms of service have not been accepted`() {
        val action = CodeWhispererWhatIsAction()
        mockCodeWhispererEnabledStatus(false)
        action.update(event)
        assertThat(event.presentation.isEnabledAndVisible).isFalse
    }

    @Test
    fun `CodeWhispererWhatIsAction actionPerformed should open correct URI`() {
        val action = CodeWhispererWhatIsAction()
        testBrowserActionHelper(action, CodeWhispererConstants.Q_MARKETPLACE_URI)
    }

    @Test
    fun `CodeWhispererShowSettingsAction actionPerformed should show settings dialog`() {
        val settingsSpy = spy(ShowSettingsUtil.getInstance())
        doNothing().`when`(settingsSpy).showSettingsDialog(any(), any<Class<out Configurable>>())
        ApplicationManager.getApplication().replaceService(ShowSettingsUtil::class.java, settingsSpy, disposableRule.disposable)
        val action = CodeWhispererShowSettingsAction()
        runInEdtAndWait {
            action.actionPerformed(event)
            verify(settingsSpy).showSettingsDialog(any(), eq(CodeWhispererConfigurable::class.java))
        }
    }

    private fun testBrowserActionHelper(action: AnAction, expectedUri: String) {
        val urlCaptor = argumentCaptor<URI>()
        action.actionPerformed(event)
        verify(browserLauncherSpy).browse(urlCaptor.capture())
        assertThat(urlCaptor.lastValue).isEqualTo(URI(expectedUri))
    }
}
