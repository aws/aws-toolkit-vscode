// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.ide.util.projectWizard.AbstractNewProjectStep
import com.intellij.ide.util.projectWizard.CustomStepProjectGenerator
import com.intellij.ide.util.projectWizard.ProjectSettingsStepBase
import com.intellij.ide.util.projectWizard.SettingsStep
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.impl.welcomeScreen.AbstractActionWithPanel
import com.intellij.platform.DirectoryProjectGenerator
import com.intellij.platform.DirectoryProjectGeneratorBase
import com.intellij.platform.HideableProjectGenerator
import com.intellij.platform.ProjectGeneratorPeer
import com.intellij.platform.ProjectTemplate
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.resources.message
import javax.swing.Icon
import javax.swing.JComponent

/**
 * [DirectoryProjectGeneratorBase] so it shows up in Light IDEs
 * [ProjectTemplate] To allow for us to shim it into ProjectTemplatesFactory and use this in IntelliJ
 * [CustomStepProjectGenerator] so we have full control over the panel
 * [HideableProjectGenerator] so that we can hide it if the IDE doesnt support any of our runtimes
 */
class SamProjectGenerator :
    DirectoryProjectGeneratorBase<SamNewProjectSettings>(),
    ProjectTemplate,
    CustomStepProjectGenerator<SamNewProjectSettings>,
    HideableProjectGenerator {

    // Public for the metrics..is there a better way?
    val schemaPanel = SchemaSelectionPanel()

    val wizardFragments = listOf(
        SdkSelectionPanel(),
        schemaPanel
    )

    private val builder = SamProjectBuilder(this)
    val peer = SamProjectGeneratorSettingsPeer(this, wizardFragments)

    // Only show our wizard if we have SAM templates to show
    override fun isHidden(): Boolean = SamProjectTemplate.supportedTemplates().isEmpty()

    override fun createStep(
        projectGenerator: DirectoryProjectGenerator<SamNewProjectSettings>?,
        callback: AbstractNewProjectStep.AbstractCallback<SamNewProjectSettings>?
    ): AbstractActionWithPanel = SamProjectRuntimeSelectionStep(this)

    // entry point for the Wizard, both light and heavy IDEs eventually hit this spot through our shims
    override fun generateProject(
        project: Project,
        baseDir: VirtualFile,
        settings: SamNewProjectSettings,
        module: Module
    ) {
        val rootModel = ModuleRootManager.getInstance(module).modifiableModel
        builder.contentEntryPath = baseDir.path
        builder.setupRootModel(rootModel)

        runWriteAction {
            rootModel.commit()
        }
    }

    // the peer is in control of the first pane
    override fun createPeer(): ProjectGeneratorPeer<SamNewProjectSettings> = peer

    // these overrides will give us a section for non-IntelliJ IDEs
    override fun getName() = message("sam.init.name")

    override fun getDescription(): String = message("sam.init.description")

    override fun getLogo(): Icon = AwsIcons.Resources.SERVERLESS_APP

    override fun getIcon(): Icon = logo

    override fun createModuleBuilder(): SamProjectBuilder = builder

    // validation is done in the peer
    override fun validateSettings(): ValidationInfo? = null

    override fun getHelpId(): String = HelpIds.NEW_SERVERLESS_PROJECT_DIALOG.id
}

/**
 * Used to overwrite the entire panel in the "light" IDEs so we don't put our settings under "More Settings"
 */
class SamProjectRuntimeSelectionStep(projectGenerator: SamProjectGenerator) :
    ProjectSettingsStepBase<SamNewProjectSettings>(projectGenerator, AbstractNewProjectStep.AbstractCallback<SamNewProjectSettings>())

class SamProjectGeneratorSettingsPeer(val generator: SamProjectGenerator, private val wizardFragments: List<WizardFragment>) :
    ProjectGeneratorPeer<SamNewProjectSettings> {
    private lateinit var samInitSelectionPanel: SamInitSelectionPanel

    /**
     * This hook is used in PyCharm and is called via {@link SamProjectBuilder#modifySettingsStep} for IntelliJ
     */
    override fun validate(): ValidationInfo? = samInitSelectionPanel.validate()

    override fun getSettings(): SamNewProjectSettings = samInitSelectionPanel.getNewProjectSettings()

    // "Deprecated" but required to implement. Not importing to avoid the import deprecation warning.
    @Suppress("OverridingDeprecatedMember", "DEPRECATION")
    override fun addSettingsStateListener(listener: com.intellij.platform.WebProjectGenerator.SettingsStateListener) {
    }

    // we sacrifice a lot of convenience so we can build the UI here...
    override fun buildUI(settingsStep: SettingsStep) {
        // delegate to another panel instead of trying to write UI as code
        settingsStep.addSettingsComponent(component)
    }

    override fun isBackgroundJobRunning(): Boolean = false

    // PyCharm uses this
    override fun getComponent(locationField: TextFieldWithBrowseButton, checkValid: Runnable): JComponent = getPanel(locationField).mainPanel

    // IntelliJ uses this
    override fun getComponent(): JComponent = getPanel(null).mainPanel

    private fun getPanel(locationField: TextFieldWithBrowseButton?): SamInitSelectionPanel {
        if (!::samInitSelectionPanel.isInitialized) {
            samInitSelectionPanel = SamInitSelectionPanel(wizardFragments, locationField)
        }

        return samInitSelectionPanel
    }
}
