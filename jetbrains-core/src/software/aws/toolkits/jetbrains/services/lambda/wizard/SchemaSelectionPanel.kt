// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.ui.layout.panel
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamSchemaDownloadPostCreationAction
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.ui.connection.AwsConnectionSettingsSelector
import software.aws.toolkits.resources.message
import javax.swing.JComponent

/*
 * A panel encapsulating  AWS credential selection during SAM new project creation wizard
  */
class SchemaSelectionPanel : WizardFragment {
    private val schemaSelector = SchemaResourceSelector()
    private val awsConnectionSelector = AwsConnectionSettingsSelector(
        DefaultProjectFactory.getInstance().defaultProject,
        schemaSelector::reloadSchemas
    )
    private val component = panel {
        row {
            awsConnectionSelector.selectorPanel()(grow)
        }
        row(message("sam.init.schema.label")) {
            schemaSelector.component(grow)
        }
    }

    override fun title(): String = message("sam.init.schema.label")

    override fun component(): JComponent = component

    override fun validateFragment(): ValidationInfo? {
        if (awsConnectionSelector.selectedCredentialProvider() == null) {
            return ValidationInfo(message("sam.init.schema.aws_credentials_select"), awsConnectionSelector.view.credentialProvider)
        }
        if (awsConnectionSelector.selectedRegion() == null) {
            return ValidationInfo(message("sam.init.schema.aws_credentials_select_region"), awsConnectionSelector.view.region)
        }
        if (schemaSelector.registryName() == null || schemaSelector.schemaName() == null) {
            return ValidationInfo(message("sam.init.schema.pleaseSelect"), schemaSelector.component)
        }
        return null
    }

    override fun isApplicable(template: SamProjectTemplate?): Boolean = template?.supportsDynamicSchemas() == true

    override fun postProjectGeneration(model: ModifiableRootModel, template: SamProjectTemplate, runtime: Runtime, progressIndicator: ProgressIndicator) {
        if (!template.supportsDynamicSchemas()) {
            return
        }

        schemaSelector.buildSchemaTemplateParameters()?.let {
            progressIndicator.text = message("sam.init.generating.schema")

            val moduleRoot = model.contentRoots.firstOrNull() ?: return
            val templateFile = SamCommon.getTemplateFromDirectory(moduleRoot) ?: return

            // We take the first since we don't have any way to say generate this schema for this function
            val codeUris = SamCommon.getCodeUrisFromTemplate(model.project, templateFile).firstOrNull() ?: return
            val connectionSettings = awsConnectionSelector.connectionSettings() ?: return
            val runtimeGroup = runtime.runtimeGroup ?: return

            SamSchemaDownloadPostCreationAction().downloadCodeIntoWorkspace(
                it,
                VfsUtil.virtualToIoFile(codeUris).toPath(),
                runtimeGroup.toSchemaCodeLang(),
                connectionSettings,
                progressIndicator
            )
        }
    }

    fun schemaInfo() = schemaSelector.buildSchemaTemplateParameters()

    private fun RuntimeGroup.toSchemaCodeLang(): SchemaCodeLangs = when (this.id) {
        BuiltInRuntimeGroups.Java -> SchemaCodeLangs.JAVA8
        BuiltInRuntimeGroups.Python -> SchemaCodeLangs.PYTHON3_6
        BuiltInRuntimeGroups.NodeJs -> SchemaCodeLangs.TYPESCRIPT
        else -> throw IllegalStateException("Schemas is not supported by $this")
    }
}
