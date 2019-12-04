// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.ComboboxSpeedSearch
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
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
    // Subsequent parameters injectable for unit tests to eanble mocking because ResourceSelector has inconsistent unit test behaviour
    val resourceSelectorBuilder: ResourceSelector.ResourceBuilder = ResourceSelector.builder(project),
    private val useSpeedSearch: Boolean = true,
    private val rootPanelBuilder: () -> JPanel = { JPanel(BorderLayout()) }
) :
    SchemaSelectionPanelBase(project) {

    override val schemaSelectionLabel: JLabel? = JLabel(message("sam.init.schema.label"))

    private val schemaPanel: JPanel

    private var currentAwsConnection: AwsConnection

    val schemasSelector: ResourceSelector<SchemaSelectionItem>

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

    private fun initializeAwsConnection(): AwsConnection {
        val settings = ProjectAccountSettingsManager.getInstance(project)
        if (settings.hasActiveCredentials()) {
            return settings.activeRegion to settings.activeCredentialProvider
        } else {
            return settings.activeRegion to LateBoundToolkitCredentialsProvider()
        }
    }

    private fun initializeSchemasSelector(): ResourceSelector<SchemaSelectionItem> =
        resourceSelectorBuilder
            .resource(SchemasResources.LIST_REGISTRIES_AND_SCHEMAS)
            .comboBoxModel(SchemaSelectionComboBoxModel())
            .customRenderer(SchemaSelectionListCellRenderer())
            .disableAutomaticLoading()
            .disableAutomaticSorting()
            .awsConnection({ currentAwsConnection }) // Must be inline function as it gets updated and re-evaluated
            .build()

    override fun reloadSchemas(awsConnection: Pair<AwsRegion, ToolkitCredentialsProvider>?) {
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

    override fun registryName(): String? {
        val selected = schemasSelector.selected()
        when (selected) {
            is SchemaSelectionItem.SchemaItem -> {
                return selected.registryName
            }
            else -> {
                return null
            }
        }
    }

    override fun schemaName(): String? {
        val selected = schemasSelector.selected()
        when (selected) {
            is SchemaSelectionItem.SchemaItem -> {
                return selected.itemText
            }
            else -> {
                return null
            }
        }
    }

    // LateBoundToolkitCredentialsProvider throws because it expects the credentials to be provided later (in this case, via invoking reloadSchemas)
    private class LateBoundToolkitCredentialsProvider : ToolkitCredentialsProvider() {
        override val id: String
            get() = throw CredentialProviderNotFound(message("credentials.profile.not_configured"))
        override val displayName: String
            get() = throw CredentialProviderNotFound(message("credentials.profile.not_configured"))

        override fun resolveCredentials(): AwsCredentials {
            throw CredentialProviderNotFound(message("credentials.profile.not_configured"))
        }
    }
}
