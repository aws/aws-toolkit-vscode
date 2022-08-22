// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.ComponentValidator
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RunsInEdt
import com.intellij.ui.components.JBTextField
import com.intellij.ui.layout.applyToComponent
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import javax.swing.JButton
import javax.swing.JTextField

@RunsInEdt
class ValidatingPanelTest {
    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val executeOnEdtRule = EdtRule()

    @Rule
    @JvmField
    val appRule = ApplicationRule()

    @Test
    fun `valid panels can execute actions`() {
        val testPanel = TestPanel(initialTextValue = "Valid text")

        assertThat(testPanel.validatingButton.isEnabled).isTrue
        assertThat(testPanel.normalButton.isEnabled).isTrue

        assertThat(testPanel.executeValidatingButton()).isTrue
        assertThat(testPanel.executeNormalButton()).isTrue
    }

    @Test
    fun `invalid panels can only execute normal actions`() {
        val testPanel = TestPanel()

        assertThat(testPanel.validatingButton.isEnabled).isTrue
        assertThat(testPanel.normalButton.isEnabled).isTrue

        assertThat(testPanel.executeValidatingButton()).isFalse
        assertThat(testPanel.executeNormalButton()).isTrue

        assertThat(testPanel.validatingButton.isEnabled).isFalse
        assertThat(testPanel.normalButton.isEnabled).isTrue
    }

    @Test
    fun `errors get applied on executing a validating action`() {
        val testPanel = TestPanel()

        assertThat(testPanel.textFieldValidator?.validationInfo).isNull()

        assertThat(testPanel.executeValidatingButton()).isFalse
        assertThat(testPanel.validatingButton.isEnabled).isFalse

        assertThat(testPanel.textFieldValidator?.validationInfo?.message).isNotEmpty
    }

    @Test
    fun `errors get applied and cleared on typing`() {
        val testPanel = TestPanel()

        assertThat(testPanel.textFieldValidator?.validationInfo).isNull()
        assertThat(testPanel.validatingButton.isEnabled).isTrue

        testPanel.textFieldComponent.text = "Foo"

        assertThat(testPanel.textFieldValidator?.validationInfo?.message).isNotEmpty
        assertThat(testPanel.validatingButton.isEnabled).isFalse

        testPanel.textFieldComponent.text = "Valid Text"

        assertThat(testPanel.textFieldValidator?.validationInfo).isNull()
        assertThat(testPanel.validatingButton.isEnabled).isTrue
    }

    @Test
    fun `valid panels can apply their state`() {
        val initialText = "Initial Text"
        val updatedText = "Updated Text"
        val testPanel = TestPanel(initialTextValue = initialText)

        assertThat(testPanel.textFieldComponent.text).isEqualTo(initialText)

        testPanel.textFieldComponent.text = updatedText

        assertThat(testPanel.executeValidatingButton()).isTrue

        assertThat(testPanel.testText).isEqualTo(updatedText)
    }

    inner class TestPanel(initialTextValue: String = "") {
        var testText = initialTextValue

        private val validatingButtonName = "NeedsValidation"
        private val normalButtonName = "DoesNotNeedValidation"
        private var validatingButtonRan = false
        private var normalButtonRan = false
        lateinit var textFieldComponent: JTextField
            private set
        lateinit var validatingButton: JButton
            private set
        lateinit var normalButton: JButton
            private set

        @Suppress("UnusedPrivateMember")
        private val panel = validatingPanel(disposableRule.disposable) {
            row {
                validatingButton(validatingButtonName) {
                    validatingButtonRan = true
                }.applyToComponent {
                    validatingButton = this
                }

                button(normalButtonName) {
                    normalButtonRan = true
                }.applyToComponent {
                    normalButton = this
                }

                textField(::testText)
                    .withValidationOnInput { it.validateText() }
                    .withValidationOnApply { it.validateText() }
                    .applyToComponent {
                        textFieldComponent = this
                    }
            }
        }

        private fun JBTextField.validateText() = if (this.text.length < 5) ValidationInfo("Test Error, '${this.text}'.length() < 5", this) else null

        fun executeValidatingButton(): Boolean {
            validatingButtonRan = false
            validatingButton.doClick()
            return validatingButtonRan
        }

        fun executeNormalButton(): Boolean {
            normalButtonRan = false
            normalButton.doClick()
            return normalButtonRan
        }

        val textFieldValidator: ComponentValidator?
            get() = ComponentValidator.getInstance(textFieldComponent).orElse(null)
    }
}
