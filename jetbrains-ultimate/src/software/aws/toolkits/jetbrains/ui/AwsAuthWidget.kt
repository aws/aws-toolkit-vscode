// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.database.dataSource.DataSourceUiUtil
import com.intellij.database.dataSource.DatabaseCredentialsAuthProvider
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.database.dataSource.url.template.ParametersHolder
import com.intellij.database.dataSource.url.template.UrlEditorModel
import com.intellij.database.dataSource.url.ui.UrlPropertiesPanel
import com.intellij.ui.components.JBLabel
import com.intellij.uiDesigner.core.GridLayoutManager
import com.intellij.util.text.nullize
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import javax.swing.JPanel
import javax.swing.event.DocumentListener

abstract class AwsAuthWidget(private val userField: Boolean = true) : DatabaseCredentialsAuthProvider.UserWidget() {
    private val credentialSelector = CredentialProviderSelector()
    private val regionSelector = RegionSelector()

    // These are defined in DataGrip and used in the url holder which is called in `updateFromUrl`
    protected val hostParameter = "host"
    protected val portParameter = "port"

    abstract fun getRegionFromUrl(url: String?): String?

    open val rowCount: Int = 3
    open val columnCount: Int = 6

    override fun createPanel(): JPanel {
        val panel = JPanel(GridLayoutManager(rowCount, columnCount))
        if (userField) {
            addUserField(panel, 0)
        }
        val credsLabel = JBLabel(message("aws_connection.credentials.label"))
        val regionLabel = JBLabel(message("aws_connection.region.label"))
        panel.add(credsLabel, UrlPropertiesPanel.createLabelConstraints(1, 0, credsLabel.preferredSize.getWidth()))
        panel.add(credentialSelector, UrlPropertiesPanel.createSimpleConstraints(1, 1, 3))
        panel.add(regionLabel, UrlPropertiesPanel.createLabelConstraints(2, 0, regionLabel.preferredSize.getWidth()))
        panel.add(regionSelector, UrlPropertiesPanel.createSimpleConstraints(2, 1, 3))

        return panel
    }

    override fun save(dataSource: LocalDataSource, copyCredentials: Boolean) {
        // Tries to set username so if we don't have one, don't set
        if (userField) {
            super.save(dataSource, copyCredentials)
        }

        DataSourceUiUtil.putOrRemove(
            dataSource.additionalJdbcProperties,
            CREDENTIAL_ID_PROPERTY,
            credentialSelector.getSelectedCredentialsProvider()
        )
        DataSourceUiUtil.putOrRemove(
            dataSource.additionalJdbcProperties,
            REGION_ID_PROPERTY,
            regionSelector.selectedRegion?.id
        )
    }

    override fun reset(dataSource: LocalDataSource, resetCredentials: Boolean) {
        // Tries to set username so if we don't have one, don't set
        if (userField) {
            super.reset(dataSource, resetCredentials)
        }

        val regionProvider = AwsRegionProvider.getInstance()
        val allRegions = regionProvider.allRegions()
        regionSelector.setRegions(allRegions.values.toMutableList())
        val regionId = dataSource.additionalJdbcProperties[REGION_ID_PROPERTY]?.nullize()
        regionId?.let {
            allRegions[regionId]?.let {
                regionSelector.selectedRegion = it
            }
        }

        val credentialManager = CredentialManager.getInstance()
        credentialSelector.setCredentialsProviders(credentialManager.getCredentialIdentifiers())
        val credentialId = dataSource.additionalJdbcProperties[CREDENTIAL_ID_PROPERTY]?.nullize()
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
    override fun onChanged(r: DocumentListener) {
        // Tries to set username so if we don't have one, don't set
        if (userField) {
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
