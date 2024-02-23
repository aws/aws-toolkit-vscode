// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift.auth

import com.intellij.database.dataSource.DataSourceUiUtil
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.database.dataSource.url.template.ParametersHolder
import com.intellij.database.dataSource.url.template.UrlEditorModel
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.redshift.RedshiftClient
import software.aws.toolkits.jetbrains.UiConstraints
import software.aws.toolkits.jetbrains.services.redshift.RedshiftUtils
import software.aws.toolkits.jetbrains.ui.AwsAuthWidget
import software.aws.toolkits.resources.message
import javax.swing.JPanel

const val CLUSTER_ID_PROPERTY = "AWS.RedshiftClusterId"

class IamAuthWidget : AwsAuthWidget() {
    private val clusterIdSelector = JBTextField()

    override val rowCount = 4
    override fun getRegionFromUrl(url: String?): String? = RedshiftUtils.extractRegionFromUrl(url)
    override val serviceId: String = RedshiftClient.SERVICE_NAME

    override fun createPanel(): JPanel {
        val panel = super.createPanel()
        val regionLabel = JBLabel(message("redshift.cluster_id"))
        panel.add(regionLabel, UiConstraints.createLabelConstraints(3, 0, regionLabel.preferredSize.getWidth()))
        panel.add(clusterIdSelector, UiConstraints.createSimpleConstraints(3, 1, 3))
        return panel
    }

    override fun save(dataSource: LocalDataSource, copyCredentials: Boolean) {
        super.save(dataSource, copyCredentials)

        DataSourceUiUtil.putOrRemove(
            dataSource.additionalProperties,
            CLUSTER_ID_PROPERTY,
            clusterIdSelector.text
        )
    }

    override fun reset(dataSource: LocalDataSource, resetCredentials: Boolean) {
        super.reset(dataSource, resetCredentials)
        clusterIdSelector.text = dataSource.additionalProperties[CLUSTER_ID_PROPERTY]
    }

    override fun updateFromUrl(holder: ParametersHolder) {
        super.updateFromUrl(holder)
        val url = (holder as? UrlEditorModel)?.url
        val clusterId = RedshiftUtils.extractClusterIdFromUrl(url)
        clusterId?.let { clusterIdSelector.text = it }
    }

    @TestOnly
    internal fun getClusterId() = clusterIdSelector.text
}
