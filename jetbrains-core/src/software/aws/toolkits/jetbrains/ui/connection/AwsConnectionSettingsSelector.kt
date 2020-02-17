// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.connection

import com.intellij.openapi.project.Project
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import javax.swing.JComponent

class AwsConnectionSettingsSelector(
    private val project: Project,
    private val settingsChangedListener: (AwsRegion?, String?) -> Unit = { _, _ -> }
) {
    private val regionProvider = AwsRegionProvider.getInstance()
    private val credentialManager = CredentialManager.getInstance()
    val view = AwsConnectionSettings()

    init {
        view.region.setRegions(regionProvider.regions().values.toMutableList())
        view.credentialProvider.setCredentialsProviders(credentialManager.getCredentialIdentifiers())

        val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)
        view.region.selectedRegion = accountSettingsManager.activeRegion
        if (accountSettingsManager.isValidConnectionSettings()) {
            accountSettingsManager.selectedCredentialIdentifier?.let {
                view.credentialProvider.setSelectedCredentialsProvider(it)
            }
        }
        view.region.addActionListener {
            fireChange()
        }
        view.credentialProvider.addActionListener {
            fireChange()
        }
    }

    private fun fireChange() {
        settingsChangedListener(view.region.selectedRegion, view.credentialProvider.getSelectedCredentialsProvider())
    }

    fun selectorPanel(): JComponent = view.panel

    fun resetAwsConnectionOptions(regionId: String?, credentialProviderId: String?) {
        regionId?.let { view.region.selectedRegion = regionProvider.lookupRegionById(it) }

        credentialProviderId?.let { providerId ->
            try {
                credentialManager.getCredentialIdentifierById(providerId)?.let {
                    view.credentialProvider.setSelectedCredentialsProvider(it)
                }
            } catch (_: Exception) {
                view.credentialProvider.setSelectedInvalidCredentialsProvider(providerId)
            }
        }
    }

    fun selectedCredentialProvider(): String? = view.credentialProvider.getSelectedCredentialsProvider()

    fun selectedRegion(): AwsRegion? = view.region.selectedRegion
}
