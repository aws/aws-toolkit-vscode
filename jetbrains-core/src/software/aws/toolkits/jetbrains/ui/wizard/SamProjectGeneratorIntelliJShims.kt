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
import com.intellij.openapi.startup.StartupManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.ProjectTemplatesFactory
import com.intellij.util.DisposeAwareRunnable
import icons.AwsIcons
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.lambda.SamNewProjectSettings
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
        val settings = generator.peer.settings
        val samTemplate = settings.template

        samTemplate.setupSdk(rootModel, settings)

        // Set module type
        val selectedRuntime = settings.runtime
        val moduleType = selectedRuntime.runtimeGroup?.getModuleType() ?: ModuleType.EMPTY
        rootModel.module.setModuleType(moduleType.id)

        val contentEntry: ContentEntry = doAddContentEntry(rootModel) ?: throw Exception(message("sam.init.error.no.project.basepath"))
        val outputDir: VirtualFile = contentEntry.file ?: throw Exception(message("sam.init.error.no.virtual.file"))

        samTemplate.build(rootModel.project, selectedRuntime, outputDir)

        runPostModuleCreationStep(settings, outputDir, rootModel)
    }

    private fun runPostModuleCreationStep(
        settings: SamNewProjectSettings,
        contentRoot: VirtualFile,
        rootModel: ModifiableRootModel
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
                            settings.template.postCreationAction(settings, contentRoot, postStartRootModel)
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
            settings.template.postCreationAction(settings, contentRoot, rootModel)
        }
    }

    // add things
    override fun modifySettingsStep(settingsStep: SettingsStep): ModuleWizardStep? {
        generator.peer.buildUI(settingsStep)

        // need to return an object with validate() implemented for validation
        return object : ModuleWizardStep() {
            override fun getComponent() = null

            override fun updateDataModel() {}

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
        val LOG = getLogger<SamProjectBuilder>()
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
