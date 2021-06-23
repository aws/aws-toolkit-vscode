// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.ui.layout.applyToComponent
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.aCredentialsIdentifier
import software.aws.toolkits.jetbrains.ui.CredentialIdentifierSelector.Companion.credentialSelector
import software.aws.toolkits.jetbrains.ui.CredentialIdentifierSelector.Companion.validCredentialSelector

class CredentialIdentifierSelectorTest {
    private lateinit var credentialIdentifiers: List<CredentialIdentifier>

    @Rule
    @JvmField
    val application = ApplicationRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Before
    fun setUp() {
        credentialIdentifiers = listOf(aCredentialsIdentifier(), aCredentialsIdentifier(), aCredentialsIdentifier())
    }

    @Test
    fun `empty ID selection is not valid`() {
        val selector = CredentialIdentifierSelector(credentialIdentifiers)
        selector.setSelectedCredentialIdentifierId(null)
        assertThat(selector.isSelectionValid()).isFalse
        assertThat(selector.getSelectedValidCredentialIdentifier()).isNull()
        assertThat(selector.getSelectedCredentialsIdentifierId()).isNull()
    }

    @Test
    fun `empty identifier selection is not valid`() {
        val selector = CredentialIdentifierSelector(credentialIdentifiers)
        selector.setSelectedCredentialIdentifier(null)
        assertThat(selector.isSelectionValid()).isFalse
        assertThat(selector.getSelectedValidCredentialIdentifier()).isNull()
        assertThat(selector.getSelectedCredentialsIdentifierId()).isNull()
    }

    @Test
    fun `valid selection is valid`() {
        val selection = credentialIdentifiers.random()

        val selector = CredentialIdentifierSelector(credentialIdentifiers)
        selector.setSelectedCredentialIdentifier(selection)
        assertThat(selector.isSelectionValid()).isTrue
        assertThat(selector.getSelectedValidCredentialIdentifier()).isEqualTo(selection)
        assertThat(selector.getSelectedCredentialsIdentifierId()).isEqualTo(selection.id)
    }

    @Test
    fun `unknown ID is invalid`() {
        val selection = aCredentialsIdentifier()

        val selector = CredentialIdentifierSelector(credentialIdentifiers)
        selector.setSelectedCredentialIdentifierId(selection.id)
        assertThat(selector.isSelectionValid()).isFalse
        assertThat(selector.getSelectedValidCredentialIdentifier()).isNull()
        assertThat(selector.getSelectedCredentialsIdentifierId()).isEqualTo(selection.id)
    }

    @Test
    fun `unknown identifier is invalid`() {
        val selection = aCredentialsIdentifier()

        val selector = CredentialIdentifierSelector(credentialIdentifiers)
        selector.setSelectedCredentialIdentifier(selection)
        assertThat(selector.isSelectionValid()).isFalse
        assertThat(selector.getSelectedValidCredentialIdentifier()).isNull()
        assertThat(selector.getSelectedCredentialsIdentifierId()).isEqualTo(selection.id)
    }

    inner class ValidSelectorUiDslTest {
        lateinit var credentialIdentifierUiDsl: CredentialIdentifier
        lateinit var selector: CredentialIdentifierSelector
        fun panel() = validatingPanel(disposableRule.disposable) {
            row {
                validCredentialSelector(::credentialIdentifierUiDsl, credentialIdentifiers).applyToComponent {
                    selector = this
                }
            }
        }
    }

    inner class SelectorUiDslTest {
        var credentialIdentifierUiDsl: CredentialIdentifier? = null
        lateinit var selector: CredentialIdentifierSelector
        fun panel() = validatingPanel(disposableRule.disposable) {
            row {
                credentialSelector(::credentialIdentifierUiDsl, credentialIdentifiers).applyToComponent {
                    selector = this
                }
            }
        }
    }

    @Test
    fun `empty late init in ui dsl leads to no selection`() {
        val test = ValidSelectorUiDslTest()
        test.panel()

        assertThat(test.selector.isSelectionValid()).isFalse
        assertThat(test.selector.getSelectedValidCredentialIdentifier()).isNull()
    }

    @Test
    fun `initial selection is selected in ui dsl`() {
        val test = ValidSelectorUiDslTest()
        val selection = credentialIdentifiers.random()
        test.credentialIdentifierUiDsl = selection
        test.panel()

        assertThat(test.selector.isSelectionValid()).isTrue
        assertThat(test.selector.getSelectedValidCredentialIdentifier()).isEqualTo(selection)
    }

    @Test
    fun `valid selection is applied to field`() {
        val test = ValidSelectorUiDslTest()
        val panel = test.panel()

        val selection = credentialIdentifiers.random()
        test.selector.setSelectedCredentialIdentifier(selection)
        panel.apply()

        assertThat(panel.runValidation()).isTrue
        assertThat(test.credentialIdentifierUiDsl).isEqualTo(selection)
    }

    @Test
    fun `invalid selection is not applied to field when valid is required`() {
        val test = ValidSelectorUiDslTest()
        val panel = test.panel()
        panel.apply()

        assertThat(panel.runValidation()).isFalse
        assertThatThrownBy { test.credentialIdentifierUiDsl }.isInstanceOf(UninitializedPropertyAccessException::class.java)
    }

    @Test
    fun `invalid selection is applied to field when non-valid is allowed`() {
        val test = SelectorUiDslTest()
        val panel = test.panel()
        panel.apply()

        assertThat(panel.runValidation()).isTrue
        assertThat(test.credentialIdentifierUiDsl).isNull()
    }
}
