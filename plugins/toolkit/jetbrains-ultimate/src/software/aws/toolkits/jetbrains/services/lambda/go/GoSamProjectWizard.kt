// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.goide.project.GoProjectLibrariesService
import com.goide.sdk.GoSdkService
import com.goide.sdk.combobox.GoSdkChooserCombo
import com.goide.vgo.configuration.VgoProjectSettings
import com.intellij.facet.ui.ValidationResult
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamAppTemplateBased
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamNewProjectSettings
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamProjectWizard
import software.aws.toolkits.jetbrains.services.lambda.wizard.SdkSelector
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JLabel

class GoSamProjectWizard : SamProjectWizard {
    override fun createSdkSelectionPanel(projectLocation: TextFieldWithBrowseButton?): SdkSelector = GoSdkSelectionPanel()

    override fun listTemplates(): Collection<SamProjectTemplate> = listOf(
        SamHelloWorldGo(),
        SamEventBridgeHelloWorldGo(),
        SamEventBridgeStarterAppGo()
    )
}

class GoSdkSelectionPanel : SdkSelector {
    private val interpreterPanel = GoSdkChooserCombo()

    override fun sdkSelectionLabel() = JLabel(message("sam.init.go.sdk"))

    override fun sdkSelectionPanel(): JComponent = interpreterPanel

    override fun validateSelection(): ValidationInfo? = interpreterPanel.validator.validate(interpreterPanel.sdk)?.let {
        if (it == ValidationResult.OK) {
            return null
        }
        interpreterPanel.validationInfo(it.errorMessage)
    }

    override fun applySdkSettings(model: ModifiableRootModel) {
        GoSdkService.getInstance(model.project).setSdk(interpreterPanel.sdk)
    }
}

class SamHelloWorldGo : SamAppTemplateBased() {
    override fun postCreationAction(settings: SamNewProjectSettings, contentRoot: VirtualFile, rootModel: ModifiableRootModel, indicator: ProgressIndicator) {
        super.postCreationAction(settings, contentRoot, rootModel, indicator)
        // Turn off indexing entire gopath for the project since we are using go modules
        GoProjectLibrariesService.getInstance(rootModel.project).isIndexEntireGopath = false
        // Turn on vgo integration, required for it to resolve dependencies properly
        VgoProjectSettings.getInstance(rootModel.project).isIntegrationEnabled = true
    }

    override fun displayName() = message("sam.init.template.hello_world.name")
    override fun description() = message("sam.init.template.hello_world.description")

    override fun supportedZipRuntimes(): Set<LambdaRuntime> = setOf(LambdaRuntime.GO1_X)
    override fun supportedImageRuntimes(): Set<LambdaRuntime> = setOf(LambdaRuntime.GO1_X)

    override val appTemplateName: String = "hello-world"

    override val dependencyManager: String = "mod"
}

class SamEventBridgeHelloWorldGo : SamAppTemplateBased() {
    override fun postCreationAction(settings: SamNewProjectSettings, contentRoot: VirtualFile, rootModel: ModifiableRootModel, indicator: ProgressIndicator) {
        super.postCreationAction(settings, contentRoot, rootModel, indicator)
        // Turn off indexing entire gopath for the project since we are using go modules
        GoProjectLibrariesService.getInstance(rootModel.project).isIndexEntireGopath = false
        // Turn on vgo integration, required for it to resolve dependencies properly
        VgoProjectSettings.getInstance(rootModel.project).isIntegrationEnabled = true
    }

    override fun displayName() = message("sam.init.template.event_bridge_hello_world.name")
    override fun description() = message("sam.init.template.event_bridge_hello_world.description")

    override fun supportedZipRuntimes(): Set<LambdaRuntime> = setOf(LambdaRuntime.GO1_X)
    override fun supportedImageRuntimes() = emptySet<LambdaRuntime>()

    override val appTemplateName: String = "eventBridge-hello-world"

    override val dependencyManager: String = "mod"
}

class SamEventBridgeStarterAppGo : SamAppTemplateBased() {
    override fun postCreationAction(settings: SamNewProjectSettings, contentRoot: VirtualFile, rootModel: ModifiableRootModel, indicator: ProgressIndicator) {
        super.postCreationAction(settings, contentRoot, rootModel, indicator)
        // Turn off indexing entire gopath for the project since we are using go modules
        GoProjectLibrariesService.getInstance(rootModel.project).isIndexEntireGopath = false
        // Turn on vgo integration, required for it to resolve dependencies properly
        VgoProjectSettings.getInstance(rootModel.project).isIntegrationEnabled = true
    }

    override fun displayName() = message("sam.init.template.event_bridge_starter_app.name")
    override fun description() = message("sam.init.template.event_bridge_starter_app.description")

    override fun supportedZipRuntimes(): Set<LambdaRuntime> = setOf(LambdaRuntime.GO1_X)
    override fun supportedImageRuntimes() = emptySet<LambdaRuntime>()

    override val appTemplateName: String = "eventBridge-schema-app"

    override fun supportsDynamicSchemas(): Boolean = true

    override val dependencyManager: String = "mod"
}
