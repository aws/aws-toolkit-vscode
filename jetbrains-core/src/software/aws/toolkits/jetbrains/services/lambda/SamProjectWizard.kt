// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.execution.RunManager
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfigurationProducer
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.ui.wizard.AwsModuleType
import software.aws.toolkits.jetbrains.ui.wizard.SamInitRunner
import software.aws.toolkits.jetbrains.ui.wizard.SamProjectGenerator
import software.aws.toolkits.jetbrains.ui.wizard.SdkSelectionPanel

/**
 * Used to manage SAM project information for different [RuntimeGroup]s
 */
interface SamProjectWizard {

    /**
     * Return a collection of templates supported by the [RuntimeGroup]
     */
    fun listTemplates(): Collection<SamProjectTemplate>

    /**
     * Return an instance of UI section for selecting SDK for the [RuntimeGroup]
     */
    fun createSdkSelectionPanel(generator: SamProjectGenerator): SdkSelectionPanel

    companion object : RuntimeGroupExtensionPointObject<SamProjectWizard>(ExtensionPointName("aws.toolkit.lambda.sam.projectWizard"))
}

data class SamNewProjectSettings(
    val runtime: Runtime,
    val template: SamProjectTemplate,
    val sdkSettings: SdkSettings
)

interface SdkSettings

/**
 * Sdk settings that supports [Sdk] as the language's SDK, such as Java, Python.
 */
data class SdkBasedSdkSettings(
    val sdk: Sdk?
) : SdkSettings

abstract class SamProjectTemplate {
    abstract fun getName(): String

    open fun getDescription(): String? = null

    override fun toString() = getName()

    open fun setupSdk(rootModel: ModifiableRootModel, settings: SamNewProjectSettings) {
        val sdkSettings = settings.sdkSettings

        if (sdkSettings is SdkBasedSdkSettings) {
            // project sdk
            runWriteAction {
                ProjectRootManager.getInstance(rootModel.project).projectSdk = sdkSettings.sdk
            }
            // module sdk
            rootModel.inheritSdk()
        }
    }

    open fun postCreationAction(settings: SamNewProjectSettings, contentRoot: VirtualFile, rootModel: ModifiableRootModel) {
        SamCommon.excludeSamDirectory(contentRoot, rootModel)
        openReadmeFile(contentRoot, rootModel.project)
        createRunConfigurations(contentRoot, rootModel.project)
    }

    private fun openReadmeFile(contentRoot: VirtualFile, project: Project) {
        VfsUtil.findRelativeFile(contentRoot, "README.md")?.let {
            val fileEditorManager = FileEditorManager.getInstance(project)
            fileEditorManager.openTextEditor(OpenFileDescriptor(project, it), true) ?: LOG.warn { "Failed to open README.md" }
        }
    }

    private fun createRunConfigurations(contentRoot: VirtualFile, project: Project) {
        val template = SamCommon.getTemplateFromDirectory(contentRoot) ?: return

        val factory = LocalLambdaRunConfigurationProducer.getFactory()
        val runManager = RunManager.getInstance(project)
        SamTemplateUtils.findFunctionsFromTemplate(project, template).forEach {
            val runConfigurationAndSettings = runManager.createConfiguration(it.logicalName, factory)
            val runConfiguration = runConfigurationAndSettings.configuration as LocalLambdaRunConfiguration
            runConfiguration.useTemplate(template.path, it.logicalName)
            runConfiguration.setGeneratedName()
            runManager.addConfiguration(runConfigurationAndSettings)
            if (runManager.selectedConfiguration == null) {
                runManager.selectedConfiguration = runConfigurationAndSettings
            }
        }
    }

    fun getIcon() = AwsIcons.Resources.SERVERLESS_APP

    fun build(project: Project, runtime: Runtime, outputDir: VirtualFile) {
        var hasException = false
        try {
            doBuild(runtime, outputDir)
        } catch (e: Throwable) {
            hasException = true
            throw e
        } finally {
            TelemetryService.getInstance().record(project, "SAM") {
                datum("Init") {
                    metadata("name", getName())
                    metadata("runtime", runtime.name)
                    metadata("samVersion", SamCommon.getVersionString())
                    metadata("hasException", hasException)
                }
            }
        }
    }

    private fun doBuild(runtime: Runtime, outputDir: VirtualFile) {
        SamInitRunner.execute(
            AwsModuleType.ID,
            outputDir,
            runtime,
            location(),
            dependencyManager()
        )
    }

    protected open fun location(): String? = null

    protected open fun dependencyManager(): String? = null

    abstract fun supportedRuntimes(): Set<Runtime>

    companion object {
        private val LOG = getLogger<SamProjectTemplate>()

        @JvmField
        val SAM_TEMPLATES =
            SamProjectWizard.supportedRuntimeGroups.flatMap {
                SamProjectWizard.getInstanceOrThrow(it).listTemplates()
            }
    }
}