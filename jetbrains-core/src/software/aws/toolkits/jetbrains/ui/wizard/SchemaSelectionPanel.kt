// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.fasterxml.jackson.databind.JsonNode
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.SamProjectWizard
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.schemas.SchemaDownloader
import software.aws.toolkits.jetbrains.services.schemas.SchemaSummary
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateExtraContext
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateParameters
import software.aws.toolkits.jetbrains.ui.AwsConnection
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

// UI for selecting a Schema
interface SchemaSelectionPanel {
    val schemaSelectionPanel: JComponent

    val schemaSelectionLabel: JLabel?

    fun registryName(): String? = null

    fun schemaName(): String? = null

    fun reloadSchemas(awsConnection: AwsConnection? = null) {}

    fun buildSchemaTemplateParameters(): SchemaTemplateParameters?

    fun validateAll(): List<ValidationInfo>? = null

    companion object {

        @JvmStatic
        fun create(
            runtime: Runtime,
            selectedTemplate: SamProjectTemplate,
            generator: SamProjectGenerator
        ): SchemaSelectionPanel =
            runtime.runtimeGroup?.let { runtimeGroup ->
                if (selectedTemplate.supportsDynamicSchemas())
                    SamProjectWizard.getInstanceOrThrow(runtimeGroup).createSchemaSelectionPanel(generator)
                else
                    NoOpSchemaSelectionPanel()
            } ?: NoOpSchemaSelectionPanel()
    }
}

// UI-agnostic schema selection panel
abstract class SchemaSelectionPanelBase(private val project: Project) :
    SchemaSelectionPanel {

    private val schemaDownloader = SchemaDownloader()

    override fun buildSchemaTemplateParameters(): SchemaTemplateParameters? {
        val schemaName = schemaName()
        val registryName = registryName()

        if (schemaName == null || registryName == null) {
            return null
        }

        val schemaSummary = SchemaSummary(schemaName, registryName)

        val describeSchemaResponse = schemaDownloader.getSchemaContent(registryName, schemaName, project = project).toCompletableFuture().get()
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

class NoOpSchemaSelectionPanel : SchemaSelectionPanel {
    override fun buildSchemaTemplateParameters(): SchemaTemplateParameters? = null

    override val schemaSelectionPanel: JComponent = JPanel()

    override val schemaSelectionLabel: JLabel? = null
}
