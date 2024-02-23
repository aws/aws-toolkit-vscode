// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.execution.RunManager
import com.intellij.ide.util.projectWizard.ModuleBuilder
import com.intellij.ide.util.projectWizard.ModuleWizardStep
import com.intellij.ide.util.projectWizard.SettingsStep
import com.intellij.ide.util.projectWizard.WizardContext
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.ProjectTemplatesFactory
import icons.AwsIcons
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfigurationProducer
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateParameters
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.LambdaPackageType
import software.aws.toolkits.telemetry.SamTelemetry
import software.aws.toolkits.telemetry.Runtime.Companion as TelemetryRuntime

// Meshing of two worlds. IntelliJ wants validation errors to be thrown exceptions. Non-IntelliJ wants validation errors
// to be returned as a ValidationInfo object. We have a shim to convert thrown exceptions into objects,
// but then we lose the ability in IntelliJ to fail validation without showing an error. This is a workaround for that case.
class ValidationException : Exception()

// IntelliJ shim requires a ModuleBuilder
// UI is centralized in generator and is passed in to have access to UI elements
// TODO: Does this need to be a module builder, or can we decouple it?
class SamProjectBuilder(private val generator: SamProjectGenerator) : ModuleBuilder() {
    // hide this from the new project menu
    override fun isAvailable() = false

    // dummy type to fulfill the interface, will be replaced in setupRootModel()
    override fun getModuleType(): ModuleType<*>? = ModuleType.EMPTY

    // IntelliJ create commit step
    override fun setupRootModel(rootModel: ModifiableRootModel) {
        val settings = generator.peer.settings

        // Set module type
        val selectedRuntime = settings.runtime
        // TODO luckily this works for dotnet5.0 but if we ever need a module type for a runtime that is
        // not supported by zip and image we will need ot reexamine this
        val moduleType = selectedRuntime.toSdkRuntime()?.runtimeGroup?.getModuleType() ?: ModuleType.EMPTY
        rootModel.module.setModuleType(moduleType.id)

        val contentEntry = doAddContentEntry(rootModel) ?: throw Exception(message("sam.init.error.no.project.basepath"))
        val outputDir = contentEntry.file ?: throw Exception(message("sam.init.error.no.virtual.file"))

        val project = rootModel.project
        ProgressManager.getInstance().run(
            object : Task.Backgroundable(project, message("sam.init.generating.template"), false) {
                override fun run(indicator: ProgressIndicator) {
                    ModuleRootModificationUtil.updateModel(rootModel.module) { model ->
                        runSamInit(project, rootModel.module.name, settings, generator.schemaPanel.schemaInfo(), outputDir)

                        runPostSamInit(project, model, indicator, settings, outputDir)
                    }
                }
            }
        )
    }

    fun runSamInit(
        project: Project?,
        name: String,
        settings: SamNewProjectSettings,
        schemaParameters: SchemaTemplateParameters?,
        outputDir: VirtualFile
    ) {
        var success = true
        try {
            SamInitRunner.execute(
                outputDir,
                settings.template.templateParameters(name, settings.runtime, settings.architecture, settings.packagingType),
                schemaParameters?.takeIf { settings.template.supportsDynamicSchemas() }
            )
        } catch (e: Throwable) {
            success = false
            throw e
        } finally {
            SamTelemetry.init(
                project = project,
                success = success,
                runtime = TelemetryRuntime.from(settings.runtime.toString()),
                version = SamCommon.getVersionString(),
                templateName = getName(),
                lambdaPackageType = LambdaPackageType.from(settings.packagingType.toString()),
                eventBridgeSchema = if (schemaParameters?.schema?.registryName == SchemasResources.AWS_EVENTS_REGISTRY) schemaParameters.schema.name else null
            )
        }
    }

    fun runPostSamInit(
        project: Project,
        model: ModifiableRootModel,
        indicator: ProgressIndicator,
        settings: SamNewProjectSettings,
        outputDir: VirtualFile
    ) {
        generator.wizardFragments.forEach { it.postProjectGeneration(model, settings.template, settings.runtime, indicator) }

        settings.template.postCreationAction(settings, outputDir, model, indicator)

        // Perform a refresh to load any generated files
        outputDir.refresh(false, true)

        openReadmeFile(project, outputDir)
        createRunConfigurations(project, outputDir, settings.runtime)
    }

    private fun openReadmeFile(project: Project, contentRoot: VirtualFile) {
        VfsUtil.findRelativeFile(contentRoot, "README.md")?.let { readme ->
            readme.putUserData(TextEditorWithPreview.DEFAULT_LAYOUT_FOR_FILE, TextEditorWithPreview.Layout.SHOW_PREVIEW)

            val fileEditorManager = FileEditorManager.getInstance(project)
            runInEdt {
                fileEditorManager.openTextEditor(OpenFileDescriptor(project, readme), true) ?: LOG.warn { "Failed to open README.md" }
            }
        }
    }

    private fun createRunConfigurations(project: Project, contentRoot: VirtualFile, runtime: LambdaRuntime) {
        val template = SamCommon.getTemplateFromDirectory(contentRoot) ?: return

        val factory = LocalLambdaRunConfigurationProducer.getFactory()
        val runManager = RunManager.getInstance(project)
        SamTemplateUtils.findFunctionsFromTemplate(project, template).forEach {
            val runConfigurationAndSettings = runManager.createConfiguration(it.logicalName, factory)

            val runConfiguration = runConfigurationAndSettings.configuration as LocalLambdaRunConfiguration
            runConfiguration.useTemplate(template.path, it.logicalName, runtime.toString())
            runConfiguration.setGeneratedName()

            runManager.addConfiguration(runConfigurationAndSettings)

            if (runManager.selectedConfiguration == null) {
                runManager.selectedConfiguration = runConfigurationAndSettings
            }
        }
    }

    override fun modifySettingsStep(settingsStep: SettingsStep): ModuleWizardStep {
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

class SamProjectGeneratorIntelliJAdapter : ProjectTemplatesFactory() {
    override fun createTemplates(group: String?, context: WizardContext) = arrayOf(SamProjectGenerator())

    override fun getGroupIcon(group: String?) = AwsIcons.Logos.AWS

    override fun getGroups() = arrayOf("AWS")
}
