// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.database.dataSource.DataSourceUiUtil
import com.intellij.database.dataSource.DatabaseCredentialsAuthProviderUi
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.database.dataSource.url.template.ParametersHolder
import com.intellij.database.dataSource.url.template.UrlEditorModel
import com.intellij.ui.components.JBLabel
import com.intellij.uiDesigner.core.GridLayoutManager
import com.intellij.util.text.nullize
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.jetbrains.UiConstraints
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import javax.swing.JPanel

@Deprecated("Use AwsAuthWidget shim instead") // FIX_WHEN_MIN_IS_221
abstract class AwsAuthWidgetBase(private val userFieldEnabled: Boolean) : DatabaseCredentialsAuthProviderUi.UserWidget() {
    private val credentialSelector = CredentialProviderSelector()
    private val regionSelector = RegionSelector()

    // These are defined in DataGrip and used in the url holder which is called in `updateFromUrl`
    protected val hostParameter = "host"
    protected val portParameter = "port"

    abstract fun getRegionFromUrl(url: String?): String?
    abstract val serviceId: String

    open val rowCount: Int = 3
    open val columnCount: Int = 6

    override fun createPanel(): JPanel {
        val panel = JPanel(GridLayoutManager(rowCount, columnCount))
        addUserField(panel, 0)

        // Disable the user field if we treat it as immutable
        myUserField.isEnabled = userFieldEnabled

        val credsLabel = JBLabel(message("aws_connection.credentials.label"))
        val regionLabel = JBLabel(message("aws_connection.region.label"))
        panel.add(credsLabel, UiConstraints.createLabelConstraints(1, 0, credsLabel.preferredSize.getWidth()))
        panel.add(credentialSelector, UiConstraints.createSimpleConstraints(1, 1, 3))
        panel.add(regionLabel, UiConstraints.createLabelConstraints(2, 0, regionLabel.preferredSize.getWidth()))
        panel.add(regionSelector, UiConstraints.createSimpleConstraints(2, 1, 3))

        return panel
    }

    override fun save(dataSource: LocalDataSource, copyCredentials: Boolean) {
        super.save(dataSource, copyCredentials)

        DataSourceUiUtil.putOrRemove(
            dataSource.additionalProperties,
            CREDENTIAL_ID_PROPERTY,
            credentialSelector.getSelectedCredentialsProvider()
        )
        DataSourceUiUtil.putOrRemove(
            dataSource.additionalProperties,
            REGION_ID_PROPERTY,
            regionSelector.selectedRegion?.id
        )
    }

    override fun reset(dataSource: LocalDataSource, resetCredentials: Boolean) {
        super.reset(dataSource, resetCredentials)

        val regionProvider = AwsRegionProvider.getInstance()
        val allRegions = regionProvider.allRegionsForService(serviceId)
        regionSelector.setRegions(allRegions.values.toMutableList())
        val regionId = dataSource.additionalProperties[REGION_ID_PROPERTY]?.nullize()
        regionId?.let {
            allRegions[regionId]?.let { region ->
                regionSelector.selectedRegion = region
            }
        }

        val credentialManager = CredentialManager.getInstance()
        credentialSelector.setCredentialsProviders(credentialManager.getCredentialIdentifiers())
        val credentialId = dataSource.additionalProperties[CREDENTIAL_ID_PROPERTY]?.nullize()
        if (credentialId != null) {
            val credentialIdentifierById = credentialManager.getCredentialIdentifierById(credentialId)
            if (credentialIdentifierById != null) {
                credentialSelector.setSelectedCredentialsProvider(credentialIdentifierById)
            } else {
                credentialSelector.setSelectedInvalidCredentialsProvider(credentialId)
            }
        } else {
            credentialSelector.model.selectedItem = null
        }
    }

    override fun isPasswordChanged(): Boolean = false

    override fun onChanged(r: Runnable) {
        // Tries to set username so if we don't have one, don't set
        if (userFieldEnabled) {
            super.onChanged(r)
        }
    }

    override fun updateFromUrl(holder: ParametersHolder) {
        // Try to get region from url and set the region box on a best effort basis
        val url = (holder as? UrlEditorModel)?.url
        val regionId = getRegionFromUrl(url)
        val region = AwsRegionProvider.getInstance().allRegions()[regionId]
        region?.let {
            regionSelector.selectedRegion = it
        }
        super.updateFromUrl(holder)
    }

    @TestOnly
    internal fun getSelectedCredential() = credentialSelector.getSelectedCredentialsProvider()

    @TestOnly
    internal fun getSelectedRegion() = regionSelector.selected()
}
