// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.connection

import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.LocatableConfigurationBase
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.options.SettingsEditorGroup
import com.intellij.openapi.project.Project
import com.intellij.util.xmlb.XmlSerializer
import com.intellij.util.xmlb.annotations.Property
import org.jdom.Element
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class AwsConnectionSettingsEditor<T : AwsConnectionsRunConfigurationBase<*>>(
    project: Project,
    private val settingsChangedListener: (AwsRegion?, String?) -> Unit = { _, _ -> }
) : SettingsEditor<T>() {
    private val regionProvider = AwsRegionProvider.getInstance()
    private val credentialManager = CredentialManager.getInstance()
    private val view = AwsConnectionSettings()

    init {
        view.region.setRegions(regionProvider.regions().values.toMutableList())
        view.credentialProvider.setCredentialsProviders(credentialManager.getCredentialProviders())

        val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)
        view.region.selectedRegion = accountSettingsManager.activeRegion
        if (accountSettingsManager.hasActiveCredentials()) {
            view.credentialProvider.setSelectedCredentialsProvider(accountSettingsManager.activeCredentialProvider)
        }
        view.region.addActionListener { fireChange() }
        view.credentialProvider.addActionListener { fireChange() }
    }

    private fun fireChange() {
        settingsChangedListener(view.region.selectedRegion, view.credentialProvider.getSelectedCredentialsProvider())
    }

    override fun createEditor(): JComponent = view.panel

    override fun resetEditorFrom(settings: T) {
        view.region.selectedRegion = settings.regionId()?.let { regionProvider.lookupRegionById(it) }

        settings.credentialProviderId()?.let { credentialProviderId ->
            try {
                view.credentialProvider.setSelectedCredentialsProvider(credentialManager.getCredentialProvider(credentialProviderId))
            } catch (_: Exception) {
                view.credentialProvider.setSelectedInvalidCredentialsProvider(credentialProviderId)
            }
        }
    }

    override fun applyEditorTo(settings: T) {
        settings.credentialProviderId(view.credentialProvider.getSelectedCredentialsProvider())
        settings.regionId(view.region.selectedRegion?.id)
    }
}

fun <T : AwsConnectionsRunConfigurationBase<*>> SettingsEditorGroup<T>.addAwsConnectionEditor(settings: AwsConnectionSettingsEditor<T>) {
    addEditor(message("aws_connection.tab.label"), settings)
}

abstract class AwsConnectionsRunConfigurationBase<T : BaseAwsConnectionOptions>(
    project: Project,
    configFactory: ConfigurationFactory,
    id: String
) : LocatableConfigurationBase<T>(project, configFactory, id) {

    abstract val serializableOptions: T

    fun credentialProviderId(id: String?) {
        serializableOptions.accountOptions.credentialProviderId = id
    }

    fun credentialProviderId(): String? = serializableOptions.accountOptions.credentialProviderId

    fun regionId(id: String?) {
        serializableOptions.accountOptions.regionId = id
    }

    fun regionId(): String? = serializableOptions.accountOptions.regionId

    final override fun readExternal(element: Element) {
        super.readExternal(element)
        XmlSerializer.deserializeInto(serializableOptions, element)
    }

    final override fun writeExternal(element: Element) {
        super.writeExternal(element)
        XmlSerializer.serializeInto(serializableOptions, element)
    }
}

open class BaseAwsConnectionOptions {
    @get:Property(flat = true) // flat for backwards compat
    var accountOptions = AccountOptions()
}

class AccountOptions {
    var credentialProviderId: String? = null
    var regionId: String? = null
}
