// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.replaceService
import com.intellij.ui.dsl.builder.components.DslLabel
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.Mockito
import org.mockito.kotlin.doNothing
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
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
        assertThat(configurable.id).isEqualTo("aws.codewhisperer")
        val panel = configurable.createPanel()
        CodeWhispererExplorerActionManager.getInstance().setHasAcceptedTermsOfService(false)

        val checkboxes = panel.components.filterIsInstance<JCheckBox>()

        assertThat(checkboxes.size).isEqualTo(2)
        assertThat(checkboxes.map { it.text }).containsExactlyInAnyOrder(
            message("aws.settings.codewhisperer.include_code_with_reference"),
            message("aws.settings.codewhisperer.configurable.opt_out.title")
        )

        val comments = panel.components.filterIsInstance<DslLabel>()
        assertThat(comments.size).isEqualTo(3)

        CodeWhispererExplorerActionManager.getInstance().setHasAcceptedTermsOfService(false)
        checkboxes.forEach {
            assertThat(it.isEnabled).isFalse
        }
        val firstMessage = panel.components.firstOrNull {
            it is JLabel && it.text == message("aws.settings.codewhisperer.warning")
        }
        assertThat(firstMessage).isNotNull
        assertThat((firstMessage as JComponent).isVisible).isTrue

        CodeWhispererExplorerActionManager.getInstance().setHasAcceptedTermsOfService(true)
        checkboxes.forEach {
            assertThat(it.isEnabled).isTrue
        }
        assertThat(firstMessage.isVisible).isFalse
    }
}
