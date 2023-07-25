// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.auth

import com.intellij.database.dataSource.DataSourceUiUtil
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.database.dataSource.url.template.ParametersHolder
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import software.amazon.awssdk.services.rds.RdsClient
import software.aws.toolkits.jetbrains.UiConstraints
import software.aws.toolkits.jetbrains.services.rds.RdsResources
import software.aws.toolkits.jetbrains.ui.AwsAuthWidget
import software.aws.toolkits.resources.message
import javax.swing.JPanel

const val RDS_SIGNING_HOST_PROPERTY = "AWS.RdsSigningHost"
const val RDS_SIGNING_PORT_PROPERTY = "AWS.RdsSigningPort"

class IamAuthWidget : AwsAuthWidget() {
    private val rdsSigningHostField = JBTextField()
    private val rdsSigningPortField = JBTextField()

    override val rowCount = 4
    override fun getRegionFromUrl(url: String?): String? = RdsResources.extractRegionFromUrl(url)
    override val serviceId: String = RdsClient.SERVICE_NAME

    override fun createPanel(): JPanel {
        val panel = super.createPanel()
        val rdsSigningHostLabel = JBLabel(message("rds.url")).apply { toolTipText = message("rds.iam_help") }
        val rdsSigningPortLabel = JBLabel(message("rds.port")).apply { toolTipText = message("rds.iam_help") }
        panel.add(rdsSigningHostLabel, UiConstraints.createLabelConstraints(3, 0, rdsSigningHostLabel.preferredSize.getWidth()))
        panel.add(rdsSigningHostField, UiConstraints.createSimpleConstraints(3, 1, 3))
        panel.add(rdsSigningPortLabel, UiConstraints.createLabelConstraints(3, 4, rdsSigningPortLabel.preferredSize.getWidth()))
        panel.add(rdsSigningPortField, UiConstraints.createSimpleConstraints(3, 5, 1))
        return panel
    }

    override fun save(dataSource: LocalDataSource, copyCredentials: Boolean) {
        super.save(dataSource, copyCredentials)

        // If the user has not specified a signing host/port we will try to use the URL in the connection
        val host = if (rdsSigningHostField.text.isNullOrBlank()) {
            null
        } else {
            rdsSigningHostField.text
        }
        DataSourceUiUtil.putOrRemove(
            dataSource.additionalProperties,
            RDS_SIGNING_HOST_PROPERTY,
            host
        )

        val port = if (rdsSigningPortField.text.isNullOrBlank()) {
            null
        } else {
            rdsSigningPortField.text
        }
        DataSourceUiUtil.putOrRemove(
            dataSource.additionalProperties,
            RDS_SIGNING_PORT_PROPERTY,
            port
        )
    }

    override fun reset(dataSource: LocalDataSource, resetCredentials: Boolean) {
        super.reset(dataSource, resetCredentials)
        rdsSigningHostField.text = dataSource.additionalProperties[RDS_SIGNING_HOST_PROPERTY]
        rdsSigningPortField.text = dataSource.additionalProperties[RDS_SIGNING_PORT_PROPERTY]
    }

    override fun updateFromUrl(holder: ParametersHolder) {
        super.updateFromUrl(holder)
        holder.getParameter(hostParameter)?.let {
            rdsSigningHostField.emptyText.text = it
        }
        holder.getParameter(portParameter)?.let {
            rdsSigningPortField.emptyText.text = it
        }
    }
}
