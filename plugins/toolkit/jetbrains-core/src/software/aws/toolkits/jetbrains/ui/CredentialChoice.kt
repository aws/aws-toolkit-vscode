// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.observable.properties.GraphProperty
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.ComboboxSpeedSearch
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.layout.CellBuilder
import com.intellij.ui.layout.PropertyBinding
import com.intellij.ui.layout.Row
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import kotlin.reflect.KMutableProperty0

sealed class CredentialChoice<T>(val value: T)
private class ValidCredentialIdentifier(value: CredentialIdentifier) : CredentialChoice<CredentialIdentifier>(value)
private class InvalidCredentialIdentifier(value: String) : CredentialChoice<String>(value)

/**
 * Combo box used to select a credential provider
 */
class CredentialProviderSelector2 : ComboBox<CredentialChoice<*>>() {
    private val comboBoxModel = Model(CredentialManager.getInstance().getCredentialIdentifiers())

    init {
        model = comboBoxModel
        setRenderer(
            SimpleListCellRenderer.create("") {
                when (it) {
                    is InvalidCredentialIdentifier -> "${it.value} (Not found)"
                    is ValidCredentialIdentifier -> it.value.displayName
                    else -> ""
                }
            }
        )
        ComboboxSpeedSearch(this)
    }

    fun setCredentialsProviders(providers: List<CredentialIdentifier>) {
        comboBoxModel.setCredentialsProviders(providers)
    }

    fun setSelectedCredentialsProvider(providerId: String) {
        val item = comboBoxModel.items.filterIsInstance<ValidCredentialIdentifier>().firstOrNull { it.value.id == providerId }
            ?: comboBoxModel.addInvalidItem(providerId)
        selectedItem = item
    }

    /**
     * Returns the ID of the selected provider, even if it was invalid
     */
    fun getSelectedCredentialsIdentifier(): String? {
        comboBoxModel.selected.let {
            return when (it) {
                is ValidCredentialIdentifier -> it.value.id
                is InvalidCredentialIdentifier -> it.value
                else -> null
            }
        }
    }

    fun isSelectionValid(): Boolean = comboBoxModel.selected is ValidCredentialIdentifier
    fun getSelectedCredentialIdentifier(): CredentialIdentifier {
        if (!isSelectionValid()) {
            throw IllegalStateException("Can't get credential identifier when the selection is an invalid one")
        }

        return (comboBoxModel.selected as ValidCredentialIdentifier).value
    }

    fun setSelectedCredentialsProvider(provider: CredentialIdentifier) {
        selectedItem = provider.id
    }

    override fun setSelectedItem(anObject: Any?) {
        comboBoxModel.selectedItem = anObject
    }

    private class Model(credentialIdentifiers: List<CredentialIdentifier>) : CollectionComboBoxModel<CredentialChoice<*>>() {
        init {
            setCredentialsProviders(credentialIdentifiers)
        }

        fun setCredentialsProviders(providers: List<CredentialIdentifier>) {
            replaceAll(providers.sortedBy { it.displayName }.map { ValidCredentialIdentifier(it) })
        }

        fun addInvalidItem(id: String): InvalidCredentialIdentifier {
            val invalidItem = InvalidCredentialIdentifier(id)
            add(0, invalidItem)
            return invalidItem
        }
    }

    companion object {
        fun Row.credentialSelector(prop: KMutableProperty0<CredentialIdentifier?>): CellBuilder<CredentialProviderSelector2> {
            val binding = PropertyBinding(
                get = { prop.get() },
                set = { prop.set(it) }
            )
            return credentialSelector(binding)
        }

        fun Row.credentialSelector(prop: GraphProperty<CredentialIdentifier?>): CellBuilder<CredentialProviderSelector2> {
            val binding = PropertyBinding(
                get = { runCatching { prop.get() }.getOrNull() },
                set = { prop.set(it) }
            )
            return credentialSelector(binding)
        }

        fun Row.credentialSelector(binding: PropertyBinding<CredentialIdentifier?>): CellBuilder<CredentialProviderSelector2> {
            val credentialProviderSelector = CredentialProviderSelector2()
            return component(credentialProviderSelector)
                .withValidationOnApply { if (!credentialProviderSelector.isSelectionValid()) error("FOO") else null }
                .withBinding(
                    { component -> component.getSelectedCredentialIdentifier() },
                    { component, value -> component.selectedItem = value },
                    binding
                )
        }
    }
}
