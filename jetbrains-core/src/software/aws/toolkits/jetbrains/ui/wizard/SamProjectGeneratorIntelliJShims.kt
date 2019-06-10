// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.ide.util.projectWizard.ModuleBuilder
import com.intellij.ide.util.projectWizard.ModuleWizardStep
import com.intellij.ide.util.projectWizard.SettingsStep
import com.intellij.ide.util.projectWizard.WizardContext
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.module.ModuleTypeManager
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.roots.ContentEntry
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.roots.ui.configuration.ModulesProvider
import com.intellij.openapi.startup.StartupManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.ProjectTemplatesFactory
import com.intellij.util.DisposeAwareRunnable
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.resources.message

// Meshing of two worlds. IntelliJ wants validation errors to be thrown exceptions. Non-IntelliJ wants validation errors
// to be returned as a ValidationInfo object. We have a shim to convert thrown exceptions into objects,
// but then we lose the ability in IntelliJ to fail validation without showing an error. This is a workaround for that case.
class ValidationException : Exception()

// IntelliJ shim requires a ModuleBuilder
// UI is centralized in generator and is passed in to have access to UI elements
class SamProjectBuilder(private val generator: SamProjectGenerator) : ModuleBuilder() {
    // hide this from the new project menu
    override fun isAvailable() = false

    // dummy type to fulfill the interface
    override fun getModuleType() = AwsModuleType.INSTANCE

    // IntelliJ create commit step
    override fun setupRootModel(rootModel: ModifiableRootModel) {
        // sdk config deviates here since we're not storing information in the module builder like other standard
        // IntelliJ project wizards
        val sdk = generator.settings.sdk
        // project sdk
        ProjectRootManager.getInstance(rootModel.project).projectSdk = sdk
        // module sdk
        rootModel.inheritSdk()

        val selectedRuntime = generator.settings.runtime
        val moduleType = selectedRuntime.runtimeGroup?.getModuleType() ?: ModuleType.EMPTY

        rootModel.module.setModuleType(moduleType.id)

        val contentEntry: ContentEntry = doAddContentEntry(rootModel) ?: throw Exception(message("sam.init.error.no.project.basepath"))
        val outputDir: VirtualFile = contentEntry.file ?: throw Exception(message("sam.init.error.no.virtual.file"))

        val samTemplate = generator.settings.template
        samTemplate.build(rootModel.project, selectedRuntime, outputDir)

        runPostModuleCreationStep(selectedRuntime, outputDir, rootModel, samTemplate)
    }

    private fun runPostModuleCreationStep(
        runtime: Runtime,
        contentRoot: VirtualFile,
        rootModel: ModifiableRootModel,
        template: SamProjectTemplate
    ) {
        val project = rootModel.project
        if (project.isDisposed) return

        if (!project.isInitialized) {
            StartupManager.getInstance(project).registerPostStartupActivity(
                DisposeAwareRunnable.create(
                    {
                        // Since we will be running later, we will need to make a new ModifiableRootModel
                        val postStartRootModel = ModuleRootManager.getInstance(rootModel.module).modifiableModel
                        try {
                            template.postCreationAction(runtime, contentRoot, postStartRootModel)
                            WriteAction.run<Exception> {
                                postStartRootModel.commit()
                            }
                        } catch (e: Exception) {
                            LOG.error(e) { "Exception thrown during postCreationAction" }
                            postStartRootModel.dispose()
                        }
                    },
                    project
                )
            )
        } else {
            template.postCreationAction(runtime, contentRoot, rootModel)
        }
    }

    // IntelliJ wizard steps would go here. We will have to build a custom wizard in SamProjectRuntimeSelectionStep
    override fun createFinishingSteps(wizardContext: WizardContext, modulesProvider: ModulesProvider): Array<ModuleWizardStep> =
        super.createFinishingSteps(wizardContext, modulesProvider)

    // add things
    override fun modifySettingsStep(settingsStep: SettingsStep): ModuleWizardStep? {
        generator.createPeer().buildUI(settingsStep)

        // need to return an object with validate() implemented for validation
        return object : ModuleWizardStep() {
            override fun getComponent() = null

            override fun updateDataModel() {
                generator.peer.sdkPanel.ensureSdk()
            }

            @Throws(ConfigurationException::class)
            override fun validate(): Boolean {
                try {
                    val info = generator.peer.validate()
                    if (info != null) throw ConfigurationException(info.message)
                } catch (_: ValidationException) {
                    return false
                }

                return true
            }
        }
    }

    private companion object {
        val LOG = getLogger<SamHelloWorldMaven>()
    }
}

class NullBuilder : ModuleBuilder() {
    // hide this from the new project menu
    override fun isAvailable() = false

    override fun getModuleType(): ModuleType<*> = AwsModuleType.INSTANCE

    override fun setupRootModel(modifiableRootModel: ModifiableRootModel) {}
}

class AwsModuleType : ModuleType<ModuleBuilder>(ID) {
    override fun createModuleBuilder() = NullBuilder()

    override fun getName() = ID

    override fun getDescription() = message("aws.description")

    override fun getNodeIcon(isOpened: Boolean) = AwsIcons.Logos.AWS

    companion object {
        const val ID = "AWS"
        val INSTANCE: ModuleType<*> = ModuleTypeManager.getInstance().findByID(ID)
    }
}

class SamProjectGeneratorIntelliJAdapter : ProjectTemplatesFactory() {
    // pull in AWS project types here
    override fun createTemplates(group: String?, context: WizardContext?) = arrayOf(SamProjectGenerator())

    override fun getGroupIcon(group: String?) = AwsIcons.Logos.AWS

    override fun getGroups() = arrayOf("AWS")
}