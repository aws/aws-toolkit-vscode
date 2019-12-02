// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataProvider
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.services.lambda.SamProjectTemplate
import software.aws.toolkits.jetbrains.ui.connection.AwsConnectionSettingsSelector
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

interface AwsConnectionSettingsPanel {
    val selectionPanel: JComponent

    val selectionLabel: JLabel?

    fun validateAll(): List<ValidationInfo>? = null

    companion object {
        @JvmStatic
        fun create(
            selectedTemplate: SamProjectTemplate,
            generator: SamProjectGenerator,
            settingsChangedListener: (AwsRegion?, String?) -> Unit
        ): AwsConnectionSettingsPanel =
            if (selectedTemplate.supportsDynamicSchemas())
                InlineAwsConnectionSettingsPanel(generator.defaultSourceCreatingProject, settingsChangedListener)
            else
                NoOpAwsConnectionSettingsPanel()
    }
}

/*
 * A panel encapsulating  AWS credential selection during SAM new project creation wizard, so the default provided project may not have had credentials selected yet
  */
class InlineAwsConnectionSettingsPanel(
    private val project: Project,
    private val settingsChangedListener: (AwsRegion?, String?) -> Unit = { _, _ -> }
) : AwsConnectionSettingsPanel, DataProvider {

    private val awsConnectionSettingsSelector = AwsConnectionSettingsSelector(project, settingsChangedListener)

    override val selectionPanel: JComponent = awsConnectionSettingsSelector.selectorPanel()

    override val selectionLabel: JLabel = JLabel(message("sam.init.schema.aws_credentials.label"))

    override fun getData(dataId: String): Any? {
        if (CommonDataKeys.PROJECT.`is`(dataId)) {
            return project
        }
        return null
    }

    override fun validateAll(): List<ValidationInfo>? {
        if (awsConnectionSettingsSelector.selectedCredentialProvider() == null) {
            return listOf(ValidationInfo(message("sam.init.schema.aws_credentials_select"), awsConnectionSettingsSelector.selectorPanel()))
        }
        if (awsConnectionSettingsSelector.selectedRegion() == null) {
            return listOf(ValidationInfo(message("sam.init.schema.aws_credentials_select_region"), awsConnectionSettingsSelector.selectorPanel()))
        }
        return null
    }
}

class NoOpAwsConnectionSettingsPanel : AwsConnectionSettingsPanel {
    override val selectionPanel: JComponent = JPanel()

    override val selectionLabel: JLabel? = null
}
