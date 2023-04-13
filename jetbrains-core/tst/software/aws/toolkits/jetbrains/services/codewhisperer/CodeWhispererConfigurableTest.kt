// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.replaceService
import com.intellij.ui.dsl.builder.components.DslLabel
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.Mockito
import org.mockito.kotlin.doNothing
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererConfigurable
import software.aws.toolkits.resources.message
import javax.swing.JCheckBox
import javax.swing.JComponent
import javax.swing.JLabel

class CodeWhispererConfigurableTest : CodeWhispererTestBase() {

    @Test
    fun `test CodeWhisperer configurable`() {
        val codeScanManagerSpy = Mockito.spy(CodeWhispererCodeScanManager.getInstance(projectRule.project))
        doNothing().`when`(codeScanManagerSpy).addCodeScanUI()
        doNothing().`when`(codeScanManagerSpy).removeCodeScanUI()
        projectRule.project.replaceService(CodeWhispererCodeScanManager::class.java, codeScanManagerSpy, disposableRule.disposable)
        val configurable = CodeWhispererConfigurable(projectRule.project)

        // A workaround to initialize disposable in the DslConfigurableBase since somehow the disposable is
        // not configured in the tests if we don't do this
        configurable.reset()

        assertThat(configurable.id).isEqualTo("aws.codewhisperer")
        val panel = configurable.createPanel()
        mockCodeWhispererEnabledStatus(false)

        val checkboxes = panel.components.filterIsInstance<JCheckBox>()

        assertThat(checkboxes.size).isEqualTo(3)
        assertThat(checkboxes.map { it.text }).containsExactlyInAnyOrder(
            message("aws.settings.codewhisperer.include_code_with_reference"),
            message("aws.settings.codewhisperer.configurable.opt_out.title"),
            message("aws.settings.codewhisperer.automatic_import_adder")
        )

        val comments = panel.components.filterIsInstance<DslLabel>()
        assertThat(comments.size).isEqualTo(4)

        mockCodeWhispererEnabledStatus(false)
        ApplicationManager.getApplication().messageBus.syncPublisher(ToolkitConnectionManagerListener.TOPIC)
            .activeConnectionChanged(null)
        checkboxes.forEach {
            assertThat(it.isEnabled).isFalse
        }
        val firstMessage = panel.components.firstOrNull {
            it is JLabel && it.text == message("aws.settings.codewhisperer.warning")
        }
        assertThat(firstMessage).isNotNull
        assertThat((firstMessage as JComponent).isVisible).isTrue

        mockCodeWhispererEnabledStatus(true)
        ApplicationManager.getApplication().messageBus.syncPublisher(ToolkitConnectionManagerListener.TOPIC)
            .activeConnectionChanged(null)
        checkboxes.forEach {
            assertThat(it.isEnabled).isTrue
        }
        assertThat(firstMessage.isVisible).isFalse
    }
}
