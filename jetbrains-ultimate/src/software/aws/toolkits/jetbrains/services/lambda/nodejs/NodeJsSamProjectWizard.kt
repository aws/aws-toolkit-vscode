// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreter
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterField
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterManager
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterRef
import com.intellij.lang.javascript.dialects.JSLanguageLevel
import com.intellij.lang.javascript.settings.JSRootConfiguration
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.ValidationInfo
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.SamNewProjectSettings
import software.aws.toolkits.jetbrains.services.lambda.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.SamProjectWizard
import software.aws.toolkits.jetbrains.services.lambda.SdkSettings
import software.aws.toolkits.jetbrains.services.lambda.TemplateParameters
import software.aws.toolkits.jetbrains.services.lambda.TemplateParameters.AppBasedTemplate
import software.aws.toolkits.jetbrains.ui.wizard.NoOpSchemaSelectionPanel
import software.aws.toolkits.jetbrains.ui.wizard.SamProjectGenerator
import software.aws.toolkits.jetbrains.ui.wizard.SchemaSelectionPanel
import software.aws.toolkits.jetbrains.ui.wizard.SdkSelectionPanel
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JLabel

class NodeJsSamProjectWizard : SamProjectWizard {
    override fun createSchemaSelectionPanel(
        generator: SamProjectGenerator
    ): SchemaSelectionPanel =
        NoOpSchemaSelectionPanel()

    override fun createSdkSelectionPanel(generator: SamProjectGenerator): SdkSelectionPanel =
        NodeJsSdkSelectionPanel()

    override fun listTemplates(): Collection<SamProjectTemplate> = listOf(
        SamHelloWorldNodeJs()
    )
}

class NodeJsSdkSelectionPanel : SdkSelectionPanel {
    private var interpreterPanel: NodeJsInterpreterField? = null

    override val sdkSelectionLabel: JLabel?
        get() = JLabel(message("sam.init.node_interpreter.label"))

    override val sdkSelectionPanel: JComponent
        get() {
            val project = ProjectManager.getInstance().defaultProject
            val nodeJsInterpreterField = object : NodeJsInterpreterField(project, false) {
                override fun isDefaultProjectInterpreterField(): Boolean = true
            }
            nodeJsInterpreterField.interpreterRef = NodeJsInterpreterManager.getInstance(project).interpreterRef
            interpreterPanel = nodeJsInterpreterField
            return nodeJsInterpreterField
        }

    override fun registerListeners() { }

    override fun validateAll(): List<ValidationInfo>? = null

    override fun getSdkSettings(): SdkSettings = NodeJsSdkSettings(interpreter = interpreterPanel?.interpreter)
}

class NodeJsSdkSettings(
    val interpreter: NodeJsInterpreter? = null,
    val languageLevel: JSLanguageLevel = JSLanguageLevel.ES6
) : SdkSettings

abstract class SamNodeJsProjectTemplate : SamProjectTemplate() {
    override fun supportedRuntimes(): Set<Runtime> = setOf(Runtime.NODEJS10_X, Runtime.NODEJS12_X)

    override fun setupSdk(rootModel: ModifiableRootModel, settings: SamNewProjectSettings) {
        val nodeJsSdkSettings = settings.sdkSettings as NodeJsSdkSettings
        NodeJsInterpreterManager.getInstance(rootModel.project).setInterpreterRef(NodeJsInterpreterRef.create(nodeJsSdkSettings.interpreter))
        JSRootConfiguration.getInstance(rootModel.project).storeLanguageLevelAndUpdateCaches(nodeJsSdkSettings.languageLevel)
    }
}

class SamHelloWorldNodeJs : SamNodeJsProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun templateParameters(): TemplateParameters = AppBasedTemplate("hello-world", "npm")
}
