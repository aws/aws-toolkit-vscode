// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.util.containers.OrderedSet
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.jetbrains.utils.ui.selected

/**
 * Combo box used to select a credential provider
 *
 * TODO: Find a way to make this more typesafe
 */
class CredentialProviderSelector : ComboBox<Any>() {
    private val comboBoxModel = Model()

    init {
        model = comboBoxModel
        setRenderer(RENDERER)
    }

    fun setCredentialsProviders(providers: List<ToolkitCredentialsIdentifier>) {
        comboBoxModel.items = providers
    }

    /**
     * Returns the ID of the selected provider, even if it was invalid
     */
    fun getSelectedCredentialsProvider(): String? {
        selected().let {
            return when (it) {
                is ToolkitCredentialsIdentifier -> it.id
                is String -> it
                else -> null
            }
        }
    }

    fun setSelectedCredentialsProvider(provider: ToolkitCredentialsIdentifier) {
        selectedItem = provider
    }

    /**
     * Secondary method to set the selected credential provider using ID.
     * This should be used if the provider ID does not exist and we want to expose that
     * to the user. For example, run configurations that persist the ID used to invoke it
     * that had the ID deleted between uses should show the raw ID and that it is not found
     */
    fun setSelectedInvalidCredentialsProvider(providerId: String?) {
        comboBoxModel.add(providerId)
        selectedItem = providerId
    }

    private inner class Model : CollectionComboBoxModel<Any>(OrderedSet<Any>()) {
        fun setItems(newItems: List<Any>) {
            internalList.apply {
                clear()
                addAll(newItems)
            }
        }
    }

    private companion object {
        val RENDERER = SimpleListCellRenderer.create<Any>("") {
            when (it) {
                is String -> "$it (Not valid)"
                is ToolkitCredentialsIdentifier -> it.displayName
                else -> ""
            }
        }
    }
}
