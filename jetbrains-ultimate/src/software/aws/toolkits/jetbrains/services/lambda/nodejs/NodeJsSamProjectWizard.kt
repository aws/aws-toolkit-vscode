// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterField
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterManager
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterRef
import com.intellij.lang.javascript.dialects.JSLanguageLevel
import com.intellij.lang.javascript.settings.JSRootConfiguration
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.ui.ValidationInfo
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.wizard.AppBasedTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamProjectWizard
import software.aws.toolkits.jetbrains.services.lambda.wizard.SdkSelector
import software.aws.toolkits.jetbrains.services.lambda.wizard.TemplateParameters
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JLabel

class NodeJsSamProjectWizard : SamProjectWizard {
    override fun createSdkSelectionPanel(projectLocation: TextFieldWithBrowseButton?): SdkSelector? = NodeJsSdkSelectionPanel()

    override fun listTemplates(): Collection<SamProjectTemplate> = listOf(
        SamHelloWorldNodeJs()
    )
}

class NodeJsSdkSelectionPanel : SdkSelector {
    private val interpreterPanel = createInterpreterField()

    private fun createInterpreterField(): NodeJsInterpreterField {
        val project = ProjectManager.getInstance().defaultProject
        return object : NodeJsInterpreterField(project, false) {
            override fun isDefaultProjectInterpreterField(): Boolean = true
        }
    }

    override fun sdkSelectionLabel() = JLabel(message("sam.init.node_interpreter.label"))

    override fun sdkSelectionPanel(): JComponent = interpreterPanel

    override fun applySdkSettings(model: ModifiableRootModel) {
        NodeJsInterpreterManager.getInstance(model.project).setInterpreterRef(NodeJsInterpreterRef.create(interpreterPanel.interpreter))
        JSRootConfiguration.getInstance(model.project).storeLanguageLevelAndUpdateCaches(JSLanguageLevel.ES6)
    }

    override fun validateSelection(): ValidationInfo? = interpreterPanel.interpreter?.validate(null)?.let {
        interpreterPanel.validationInfo(it)
    }
}

abstract class SamNodeJsProjectTemplate : SamProjectTemplate() {
    override fun supportedRuntimes(): Set<Runtime> = setOf(Runtime.NODEJS10_X, Runtime.NODEJS12_X)
}

class SamHelloWorldNodeJs : SamNodeJsProjectTemplate() {
    override fun displayName() = message("sam.init.template.hello_world.name")

    override fun description() = message("sam.init.template.hello_world.description")

    override fun templateParameters(projectName: String, runtime: Runtime): TemplateParameters = AppBasedTemplate(
        projectName,
        runtime,
        "hello-world",
        "npm"
    )
}
