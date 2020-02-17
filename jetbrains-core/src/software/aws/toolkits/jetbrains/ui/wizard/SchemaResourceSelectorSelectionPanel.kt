// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.ComboboxSpeedSearch
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.ui.AwsConnection
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

class SchemaResourceSelectorSelectionPanel(
    val builder: SamProjectBuilder,
    val runtimeGroup: RuntimeGroup,
    val project: Project,
    // Subsequent parameters injectable for unit tests to enable mocking because ResourceSelector has inconsistent unit test behaviour
    val resourceSelectorBuilder: ResourceSelector.ResourceBuilder = ResourceSelector.builder(project),
    useSpeedSearch: Boolean = true,
    rootPanelBuilder: () -> JPanel = { JPanel(BorderLayout()) }
) :
    SchemaSelectionPanelBase(project) {

    override val schemaSelectionLabel: JLabel? = JLabel(message("sam.init.schema.label"))

    private val schemaPanel: JPanel

    private var currentAwsConnection: AwsConnection?

    private val schemasSelector: ResourceSelector<SchemaSelectionItem>

    init {
        currentAwsConnection = initializeAwsConnection()

        schemasSelector = initializeSchemasSelector()

        // Configurable for unit tests because ComboboxSpeedSearch makes things dang near impossible to mock
        if (useSpeedSearch) {
            ComboboxSpeedSearch(schemasSelector)
        }

        schemaPanel = rootPanelBuilder.invoke()
        schemaPanel.add(schemasSelector, BorderLayout.CENTER)
        schemaPanel.validate()
    }

    override val schemaSelectionPanel: JComponent = schemaPanel

    private fun initializeAwsConnection(): AwsConnection? {
        val settings = ProjectAccountSettingsManager.getInstance(project)
        return if (settings.isValidConnectionSettings()) {
            settings.activeRegion to settings.activeCredentialProvider
        } else {
            null
        }
    }

    private fun initializeSchemasSelector(): ResourceSelector<SchemaSelectionItem> = resourceSelectorBuilder
        .resource(SchemasResources.LIST_REGISTRIES_AND_SCHEMAS)
        .comboBoxModel(SchemaSelectionComboBoxModel())
        .customRenderer(SchemaSelectionListCellRenderer())
        .disableAutomaticLoading()
        .disableAutomaticSorting()
        .awsConnection { currentAwsConnection ?: throw IllegalStateException(message("credentials.profile.not_configured")) } // Must be inline function as it gets updated and re-evaluated
        .build()

    override fun reloadSchemas(awsConnection: AwsConnection?) {
        if (awsConnection != null) {
            currentAwsConnection = awsConnection
        }
        schemasSelector.reload()

        schemasSelector.validate()
        schemaPanel.validate()
    }

    override fun validateAll(): List<ValidationInfo>? {
        if (schemasSelector.selected() == null || schemasSelector.selected() !is SchemaSelectionItem.SchemaItem) {
            return listOf(ValidationInfo(message("sam.init.schema.pleaseSelect"), schemasSelector))
        }
        return null
    }

    override fun registryName(): String? = when (val selected = schemasSelector.selected()) {
        is SchemaSelectionItem.SchemaItem -> selected.registryName
        else -> null
    }

    override fun schemaName(): String? = when (val selected = schemasSelector.selected()) {
        is SchemaSelectionItem.SchemaItem -> selected.itemText
        else -> null
    }
}
