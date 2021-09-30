// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.fasterxml.jackson.databind.JsonNode
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.services.schemas.SchemaDownloader
import software.aws.toolkits.jetbrains.services.schemas.SchemaSummary
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateExtraContext
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateParameters
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import javax.swing.JComponent

class SchemaResourceSelector {
    var awsConnection: ConnectionSettings? = null

    internal val schemasSelector = initializeSchemasSelector()
        @TestOnly
        get() = field

    val component: JComponent = schemasSelector

    fun reload() = schemasSelector.reload()

    private fun initializeSchemasSelector(): ResourceSelector<SchemaSelectionItem> = ResourceSelector.builder()
        .resource(SchemasResources.LIST_REGISTRIES_AND_SCHEMAS)
        .comboBoxModel(SchemaSelectionComboBoxModel())
        .customRenderer(SchemaSelectionListCellRenderer())
        .disableAutomaticLoading()
        .disableAutomaticSorting()
        .awsConnection { awsConnection }
        .build()

    fun registryName(): String? = when (val selected = schemasSelector.selected()) {
        is SchemaSelectionItem.SchemaItem -> selected.registryName
        else -> null
    }

    fun schemaName(): String? = when (val selected = schemasSelector.selected()) {
        is SchemaSelectionItem.SchemaItem -> selected.itemText
        else -> null
    }

    fun buildSchemaTemplateParameters(): SchemaTemplateParameters? {
        val schemaName = schemaName()
        val registryName = registryName()

        if (schemaName == null || registryName == null) {
            return null
        }

        val schemaSummary = SchemaSummary(schemaName, registryName)

        val schemaDownloader = SchemaDownloader()
        val describeSchemaResponse =
            schemaDownloader.getSchemaContent(registryName, schemaName, connectionSettings = awsConnection!!).toCompletableFuture().get()
        val latestSchemaVersion = describeSchemaResponse.schemaVersion()

        val schemaNode = schemaDownloader.getSchemaContentAsJson(describeSchemaResponse)
        val awsEventNode = getAwsEventNode(schemaNode)

        // Derive source from custom OpenAPI metadata provided by Schemas service
        val source = awsEventNode.path(X_AMAZON_EVENT_SOURCE).textValue() ?: DEFAULT_EVENT_SOURCE

        // Derive detail type from custom OpenAPI metadata provided by Schemas service
        val detailType = awsEventNode.path(X_AMAZON_EVENT_DETAIL_TYPE).textValue() ?: DEFAULT_EVENT_DETAIL_TYPE

        // Generate schema root/package from the scheme name
        // In the near future, this will be returned as part of a Schemas Service API call
        val schemaPackageHierarchy = buildSchemaPackageHierarchy(schemaName)

        // Derive root schema event name from OpenAPI metadata, or if ambiguous, use the last post-character section of a schema name
        val rootSchemaEventName = buildRootSchemaEventName(schemaNode, awsEventNode) ?: schemaSummary.title()

        return SchemaTemplateParameters(
            schemaSummary,
            latestSchemaVersion,
            SchemaTemplateExtraContext(
                registryName,
                rootSchemaEventName,
                schemaPackageHierarchy,
                source,
                detailType
            )
        )
    }

    private fun getAwsEventNode(schemaNode: JsonNode): JsonNode =
        // Standard OpenAPI specification
        schemaNode.path(COMPONENTS).path(SCHEMAS).path(AWS_EVENT)

    private fun buildSchemaPackageHierarchy(schemaName: String): String = SchemaCodeGenUtils.buildSchemaPackageName(schemaName)
    private fun buildRootSchemaEventName(schemaNode: JsonNode, awsEvent: JsonNode): String? {
        val awsEventDetailRef = awsEvent.path(PROPERTIES).path(DETAIL).path(REF).textValue()?.substringAfter(COMPONENTS_SCHEMAS_PATH)
        if (!awsEventDetailRef.isNullOrEmpty()) {
            return SchemaCodeGenUtils.IdentifierFormatter.toValidIdentifier(awsEventDetailRef)
        }

        val schemaRoots = schemaNode.path(COMPONENTS).path(SCHEMAS).fieldNames().asSequence().toList()
        if (schemaRoots.isNotEmpty()) {
            return SchemaCodeGenUtils.IdentifierFormatter.toValidIdentifier(schemaRoots[0])
        }

        return null
    }

    companion object {
        const val X_AMAZON_EVENT_SOURCE = "x-amazon-events-source"
        const val X_AMAZON_EVENT_DETAIL_TYPE = "x-amazon-events-detail-type"
        const val COMPONENTS = "components"
        const val SCHEMAS = "schemas"
        const val COMPONENTS_SCHEMAS_PATH = "#/components/schemas/"
        const val AWS_EVENT = "AWSEvent"
        const val PROPERTIES = "properties"
        const val DETAIL = "detail"
        const val REF = "${'$'}ref"
        const val DEFAULT_EVENT_SOURCE = "INSERT-YOUR-EVENT-SOURCE"
        const val DEFAULT_EVENT_DETAIL_TYPE = "INSERT-YOUR-DETAIL-TYPE"
    }
}
