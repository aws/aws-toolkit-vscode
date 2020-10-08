// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.ide.util.projectWizard.AbstractNewProjectStep
import com.intellij.ide.util.projectWizard.CustomStepProjectGenerator
import com.intellij.ide.util.projectWizard.ModuleBuilder
import com.intellij.ide.util.projectWizard.ProjectSettingsStepBase
import com.intellij.ide.util.projectWizard.SettingsStep
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.DefaultProjectFactory
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
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
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
    val builder = SamProjectBuilder(this)
    val step = SamProjectRuntimeSelectionStep(this)
    val peer = SamProjectGeneratorSettingsPeer(this)

    // Stable source-creating project for creating new SAM application and making API calls safely,
    // as AWSToolkit assumes across the board it's operating with an active project
    // Independent of lastUsedProject because it may not be set,
    // or could be disposed if the user chooses to create a new project in the same window as their previous
    val defaultSourceCreatingProject = createDefaultSourceCreatingProject()

    // Only show the generator if we have SAM templates to show
    override fun isHidden(): Boolean = SamProjectTemplate.SAM_TEMPLATES.isEmpty()

    override fun createStep(
        projectGenerator: DirectoryProjectGenerator<SamNewProjectSettings>?,
        callback: AbstractNewProjectStep.AbstractCallback<SamNewProjectSettings>?
    ): AbstractActionWithPanel = step

    // non-IntelliJ project commit step
    override fun generateProject(
        project: Project,
        baseDir: VirtualFile,
        settings: SamNewProjectSettings,
        module: Module
    ) {
        runInEdt {
            val rootModel = ModuleRootManager.getInstance(module).modifiableModel
            builder.contentEntryPath = baseDir.path
            builder.setupRootModel(rootModel)

            runWriteAction {
                rootModel.commit()
            }
        }
    }

    private fun createDefaultSourceCreatingProject(): Project {
        val newDefaultProject = DefaultProjectFactory.getInstance().defaultProject

        // Explicitly eager load ProjectAccountSettingsManager for the project to subscribe to credential change events
        AwsConnectionManager.getInstance(newDefaultProject)
        return newDefaultProject
    }

    // the peer is in control of the first pane
    override fun createPeer(): ProjectGeneratorPeer<SamNewProjectSettings> = peer

    // these overrides will give us a section for non-IntelliJ IDEs
    override fun getName() = message("sam.init.name")

    override fun getDescription(): String? = message("sam.init.description")

    override fun getLogo(): Icon = AwsIcons.Resources.SERVERLESS_APP

    override fun getIcon(): Icon = logo

    override fun createModuleBuilder(): ModuleBuilder = builder

    // validation is done in the peer
    override fun validateSettings(): ValidationInfo? = null

    override fun getHelpId(): String? = HelpIds.NEW_SERVERLESS_PROJECT_DIALOG.id
}

/**
 * Used to overwrite the entire panel in the "light" IDEs so we don't put our settings under "More Settings"
 */
class SamProjectRuntimeSelectionStep(
    projectGenerator: SamProjectGenerator
) : ProjectSettingsStepBase<SamNewProjectSettings>(
    projectGenerator,
    AbstractNewProjectStep.AbstractCallback<SamNewProjectSettings>()
) {
    fun getLocationField(): TextFieldWithBrowseButton = myLocationField

    override fun registerValidators() {
        super.registerValidators()
        (peer as SamProjectGeneratorSettingsPeer).registerValidators()
    }
}

class SamProjectGeneratorSettingsPeer(val generator: SamProjectGenerator) : ProjectGeneratorPeer<SamNewProjectSettings> {
    private val samInitSelectionPanel by lazy { SamInitSelectionPanel(generator) }

    /**
     * This hook is used in PyCharm and is called via {@link SamProjectBuilder#modifySettingsStep} for IntelliJ
     */
    override fun validate(): ValidationInfo? = samInitSelectionPanel.validate()

    override fun getSettings(): SamNewProjectSettings = samInitSelectionPanel.newProjectSettings

    // "Deprecated" but required to implement. Not importing to avoid the import deprecation warning.
    @Suppress("OverridingDeprecatedMember", "DEPRECATION")
    override fun addSettingsStateListener(listener: com.intellij.platform.WebProjectGenerator.SettingsStateListener) {
    }

    // we sacrifice a lot of convenience so we can build the UI here...
    override fun buildUI(settingsStep: SettingsStep) {
        // delegate to another panel instead of trying to write UI as code
        settingsStep.addSettingsComponent(component)
    }

    // order matters! we build the peer UI before we build the step UI,
    // so validators should be done after BOTH have been constructed
    fun registerValidators() {
        // register any IDE-specific behavior
        samInitSelectionPanel.registerValidators()
    }

    override fun isBackgroundJobRunning(): Boolean = false

    override fun getComponent(): JComponent = samInitSelectionPanel.mainPanel
}
