// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.auth

import com.intellij.database.dataSource.DataSourceUiUtil
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.database.dataSource.url.template.ParametersHolder
import com.intellij.database.dataSource.url.template.UrlEditorModel
import com.intellij.database.dataSource.url.ui.UrlPropertiesPanel
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.jetbrains.services.rds.RdsResources
import software.aws.toolkits.jetbrains.ui.AwsAuthWidget
import software.aws.toolkits.resources.message
import javax.swing.JPanel

const val INSTANCE_ID_PROPERTY = "AWS.RdsInstanceId"

class IamAuthWidget : AwsAuthWidget() {
    private val instanceIdTextField = JBTextField()

    override val rowCount = 4
    override fun getRegionFromUrl(url: String?): String? = RdsResources.extractRegionFromUrl(url)

    override fun createPanel(): JPanel {
        val panel = super.createPanel()
        val regionLabel = JBLabel(message("rds.instance_id"))
        panel.add(regionLabel, UrlPropertiesPanel.createLabelConstraints(3, 0, regionLabel.preferredSize.getWidth()))
        panel.add(instanceIdTextField, UrlPropertiesPanel.createSimpleConstraints(3, 1, 3))
        return panel
    }

    override fun save(dataSource: LocalDataSource, copyCredentials: Boolean) {
        super.save(dataSource, copyCredentials)

        DataSourceUiUtil.putOrRemove(
            dataSource.additionalJdbcProperties,
            INSTANCE_ID_PROPERTY,
            instanceIdTextField.text
        )
    }

    override fun reset(dataSource: LocalDataSource, resetCredentials: Boolean) {
        super.reset(dataSource, resetCredentials)
        instanceIdTextField.text = dataSource.additionalJdbcProperties[INSTANCE_ID_PROPERTY]
    }

    override fun updateFromUrl(holder: ParametersHolder) {
        super.updateFromUrl(holder)
        // cluster id does not always match what is in the url (like Aurora), so if we already
        // have something in the box, don't update it
        if (instanceIdTextField.text.isNullOrEmpty()) {
            val url = (holder as? UrlEditorModel)?.url
            val clusterId = RdsResources.extractIdentifierFromUrl(url)
            clusterId?.let { instanceIdTextField.text = it }
        }
    }

    @TestOnly
    internal fun getInstanceId() = instanceIdTextField.text
}
