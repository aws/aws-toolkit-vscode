// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("SamInitProjectBuilderCommon")

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.execution.RunManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.text.StringUtil
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
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.jetbrains.settings.SamSettings
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JTextField

interface ValidatablePanel {
    fun validate(): ValidationInfo? = null
}

abstract class SamProjectTemplate {
    abstract fun getName(): String

    open fun getDescription(): String? = null

    override fun toString() = getName()

    open fun postCreationAction(runtime: Runtime, contentRoot: VirtualFile, rootModel: ModifiableRootModel) {
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

    open fun supportedRuntimes(): Set<Runtime> = Runtime.knownValues().toSet()

    companion object {
        val LOG = getLogger<SamProjectTemplate>()
    }
}

@JvmOverloads
fun setupSamSelectionElements(samExecutableField: JTextField, editButton: JButton, label: JComponent, postEditCallback: Runnable? = null) {
    samExecutableField.text = SamSettings.getInstance().executablePath

    editButton.addActionListener {
        ShowSettingsUtil.getInstance().showSettingsDialog(DefaultProjectFactory.getInstance().defaultProject, AwsSettingsConfigurable::class.java)
        samExecutableField.text = SamSettings.getInstance().executablePath
        postEditCallback?.run()
    }

    val validSamPath = (SamCommon.validate(StringUtil.nullize(samExecutableField.text)) == null)
    samExecutableField.isVisible = !validSamPath
    editButton.isVisible = !validSamPath
    label.isVisible = !validSamPath
}