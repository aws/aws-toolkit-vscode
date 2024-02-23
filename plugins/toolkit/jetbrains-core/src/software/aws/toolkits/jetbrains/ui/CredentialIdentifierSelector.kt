// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.ComboboxSpeedSearch
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.layout.ValidationInfoBuilder
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialType
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.resources.message
import javax.swing.JList

/**
 * Combo box used to select a credential identifier
 */
class CredentialIdentifierSelector(identifiers: List<CredentialIdentifier> = CredentialManager.getInstance().getCredentialIdentifiers()) :
    ComboBox<CredentialIdentifier>() {
    private val comboBoxModel = CollectionComboBoxModel(identifiers.toMutableList())

    init {
        model = comboBoxModel
        setRenderer(object : ColoredListCellRenderer<CredentialIdentifier>() {
            override fun customizeCellRenderer(
                list: JList<out CredentialIdentifier>,
                value: CredentialIdentifier?,
                index: Int,
                selected: Boolean,
                hasFocus: Boolean
            ) {
                if (value is InvalidCredentialIdentifier) {
                    append(value.displayName, SimpleTextAttributes.ERROR_ATTRIBUTES)
                } else {
                    append(value?.displayName ?: "")
                }
            }
        })
        ComboboxSpeedSearch(this)
    }

    /**
     * Selects the specified credential identifier with the matching ID
     * If none is found, a invalid placeholder is created and selected
     */
    fun setSelectedCredentialIdentifierId(identifierId: String?) {
        val newSelection = identifierId?.let {
            comboBoxModel.items.firstOrNull { it.id == identifierId } ?: InvalidCredentialIdentifier(identifierId).also {
                comboBoxModel.add(it)
            }
        }
        selectedItem = newSelection
    }

    /**
     * Selects the specified credential identifier
     * If none is found, a invalid placeholder is created and selected
     */
    fun setSelectedCredentialIdentifier(identifier: CredentialIdentifier?) {
        setSelectedCredentialIdentifierId(identifier?.id)
    }

    fun isSelectionValid(): Boolean = comboBoxModel.selected != null && comboBoxModel.selected !is InvalidCredentialIdentifier

    /**
     * Returns the ID of the selected provider, even if it was invalid
     */
    fun getSelectedCredentialsIdentifierId(): String? = comboBoxModel.selected?.id

    /**
     * Returns the selected CredentialIdentifier if and only if it is valid
     */
    fun getSelectedValidCredentialIdentifier(): CredentialIdentifier? = comboBoxModel.selected?.takeIf { isSelectionValid() }

    class InvalidCredentialIdentifier(override val id: String) : CredentialIdentifier {
        override val displayName: String = message("credentials.invalid.not_found", id)
        override val factoryId: String = "InvalidCredentialIdentifier"
        override val credentialType: CredentialType? = null
        override val defaultRegionId: String? = null
    }

    companion object {

        fun ValidationInfoBuilder.validateSelection(selector: CredentialIdentifierSelector): ValidationInfo? = if (!selector.isSelectionValid()) {
            error(message("credentials.invalid.invalid_selection"))
        } else {
            null
        }
    }
}

fun tryResolveConnectionSettings(credentialsIdentifier: CredentialIdentifier?, region: AwsRegion?) =
    credentialsIdentifier?.let { credId ->
        region?.let { region ->
            val credentialProvider = CredentialManager.getInstance().getAwsCredentialProvider(credentialsIdentifier, region)
            ConnectionSettings(credentialProvider, region)
        }
    }
