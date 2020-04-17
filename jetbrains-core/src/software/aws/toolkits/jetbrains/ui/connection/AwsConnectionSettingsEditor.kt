// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.connection

import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.LocatableConfigurationBase
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.options.SettingsEditorGroup
import com.intellij.openapi.project.Project
import com.intellij.util.xmlb.XmlSerializer
import com.intellij.util.xmlb.annotations.Property
import org.jdom.Element
import software.aws.toolkits.core.credentials.CredentialProviderNotFoundException
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class AwsConnectionSettingsEditor<T : AwsConnectionsRunConfigurationBase<*>>(
    project: Project,
    private val settingsChangedListener: (AwsRegion?, String?) -> Unit = { _, _ -> }
) : SettingsEditor<T>() {
    private val awsConnectionSelector = AwsConnectionSettingsSelector(project, settingsChangedListener)

    override fun createEditor(): JComponent = awsConnectionSelector.selectorPanel()

    override fun resetEditorFrom(settings: T) {
        val accountOptions = settings.serializableOptions.accountOptions
        awsConnectionSelector.resetAwsConnectionOptions(accountOptions.regionId, accountOptions.credentialProviderId)
    }

    override fun applyEditorTo(settings: T) {
        settings.credentialProviderId(awsConnectionSelector.selectedCredentialProvider())
        settings.regionId(awsConnectionSelector.selectedRegion()?.id)
    }
}

fun <T : AwsConnectionsRunConfigurationBase<*>> SettingsEditorGroup<T>.addAwsConnectionEditor(settings: AwsConnectionSettingsEditor<T>) {
    addEditor(message("aws_connection.tab.label"), settings)
}

abstract class AwsConnectionsRunConfigurationBase<T : BaseAwsConnectionOptions>(
    project: Project,
    configFactory: ConfigurationFactory,
    id: String?
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

    protected fun resolveCredentials() = credentialProviderId()?.let {
        try {
            val credentialManager = CredentialManager.getInstance()
            val credentialsIdentifier = credentialManager.getCredentialIdentifierById(it)
                ?: throw CredentialProviderNotFoundException("No provider with id '$it'")

            credentialManager.getAwsCredentialProvider(credentialsIdentifier, resolveRegion())
        } catch (e: CredentialProviderNotFoundException) {
            throw RuntimeConfigurationError(message("lambda.run_configuration.credential_not_found_error", it))
        } catch (e: Exception) {
            throw RuntimeConfigurationError(
                message(
                    "lambda.run_configuration.credential_error",
                    e.message ?: "Unknown"
                )
            )
        }
    } ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_credentials_specified"))

    protected fun resolveRegion() = regionId()?.let {
        AwsRegionProvider.getInstance().allRegions()[it]
    } ?: throw RuntimeConfigurationError(message("configure.validate.no_region_specified"))

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
