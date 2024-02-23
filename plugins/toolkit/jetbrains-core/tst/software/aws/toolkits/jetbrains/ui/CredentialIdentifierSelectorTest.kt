// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.toNullableProperty
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.aCredentialsIdentifier
import software.aws.toolkits.jetbrains.ui.CredentialIdentifierSelector.Companion.validateSelection

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
        fun panel() = com.intellij.ui.dsl.builder.panel {
            row {
                selector = CredentialIdentifierSelector(credentialIdentifiers)
                cell(selector).bindItem(::credentialIdentifierUiDsl.toNullableProperty()).validationOnInput {
                    this.validateSelection(it)
                }.validationOnApply {
                    this.validateSelection(it)
                }
            }
        }
    }

    inner class SelectorUiDslTest {
        var credentialIdentifierUiDsl: CredentialIdentifier? = null
        lateinit var selector: CredentialIdentifierSelector
        fun panel() = com.intellij.ui.dsl.builder.panel {
            row {
                selector = CredentialIdentifierSelector(credentialIdentifiers)
                cell(selector).bindItem(::credentialIdentifierUiDsl.toNullableProperty())
            }
        }
    }

    @Test
    fun `empty late init in ui dsl leads to no selection`() {
        val test = ValidSelectorUiDslTest()
        assertThatThrownBy { test.credentialIdentifierUiDsl }.isInstanceOf(UninitializedPropertyAccessException::class.java)
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
        val selection = credentialIdentifiers.random()
        test.credentialIdentifierUiDsl = selection
        val panel = test.panel()
        panel.apply()
        assertThat(panel.validateAll()).isEmpty()
        assertThat(test.credentialIdentifierUiDsl).isEqualTo(selection)
    }

    @Test
    fun `invalid selection is not applied to field when valid is required`() {
        val test = ValidSelectorUiDslTest()
        assertThatThrownBy { test.credentialIdentifierUiDsl }.isInstanceOf(UninitializedPropertyAccessException::class.java)
        val selection = CredentialIdentifierSelector.InvalidCredentialIdentifier("random")
        test.credentialIdentifierUiDsl = selection
        val panel = test.panel()
        panel.apply()
        assertThat(panel.isValid).isFalse
    }

    @Test
    fun `invalid selection is applied to field when non-valid is allowed`() {
        val test = SelectorUiDslTest()
        val panel = test.panel()
        panel.apply()
        assertThat(panel.validateAll()).isEmpty()
        assertThat(test.credentialIdentifierUiDsl).isNull()
    }
}
