// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.openapi.wm.impl.status.widget.StatusBarWidgetSettings
import com.intellij.openapi.wm.impl.status.widget.StatusBarWidgetsManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.status.CodeWhispererStatusBarManager
import software.aws.toolkits.jetbrains.services.codewhisperer.status.CodeWhispererStatusBarWidgetFactory
import kotlin.test.fail

class CodeWhispererStatusBarManagerTest {
    @JvmField
    @Rule
    val applicationRule = ApplicationRule()

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    private lateinit var sut: CodeWhispererStatusBarManager
    private lateinit var widgetManager: StatusBarWidgetsManager
    private lateinit var settings: StatusBarWidgetSettings
    private lateinit var explorerActionManager: CodeWhispererExplorerActionManager
    private var factory: StatusBarWidgetFactory? = null

    @Before
    fun setup() {
        widgetManager = mock()
        projectRule.project.replaceService(StatusBarWidgetsManager::class.java, widgetManager, disposableRule.disposable)

        settings = mock()
        ApplicationManager.getApplication().replaceService(StatusBarWidgetSettings::class.java, settings, disposableRule.disposable)

        explorerActionManager = mock()
        ApplicationManager.getApplication().replaceService(CodeWhispererExplorerActionManager::class.java, explorerActionManager, disposableRule.disposable)

        factory = ExtensionPointName<StatusBarWidgetFactory>("com.intellij.statusBarWidgetFactory").extensionList.find {
            it.id == CodeWhispererStatusBarWidgetFactory.ID
        }
    }

    @Test
    fun `updateWidget - logout`() {
        assertUpdateWidgetArgumentCorrect(CodeWhispererLoginType.Logout)
    }

    @Test
    fun `udpateWidget - Sono`() {
        assertUpdateWidgetArgumentCorrect(CodeWhispererLoginType.Sono)
    }

    @Test
    fun `updateWidget - SSO`() {
        assertUpdateWidgetArgumentCorrect(CodeWhispererLoginType.SSO)
    }

    @Test
    fun `updateWidget - Accountless`() {
        assertUpdateWidgetArgumentCorrect(CodeWhispererLoginType.Accountless)
    }

    private fun assertUpdateWidgetArgumentCorrect(loginType: CodeWhispererLoginType) {
        val isWidgetVisible = loginType != CodeWhispererLoginType.Logout
        sut = CodeWhispererStatusBarManager(projectRule.project)

        configureConnection(loginType)

        sut.updateWidget()

        factory?.let {
            verify(settings).setEnabled(eq(it), eq(isWidgetVisible))
            verify(widgetManager).updateWidget(eq(it))
        } ?: fail("factory should not be null")
    }

    private fun configureConnection(loginType: CodeWhispererLoginType) {
        whenever(explorerActionManager.checkActiveCodeWhispererConnectionType(any())).thenReturn(loginType)
    }
}
