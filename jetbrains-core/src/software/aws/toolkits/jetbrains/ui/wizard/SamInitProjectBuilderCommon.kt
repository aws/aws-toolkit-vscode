// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("SamInitProjectBuilderCommon")

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.VirtualFile
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
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
        SamInitRunner(
            AwsModuleType.ID,
            outputDir,
            runtime,
            location(),
            dependencyManager()
        ).execute()
    }

    protected open fun location(): String? = null

    protected open fun dependencyManager(): String? = null

    open fun supportedRuntimes(): Set<Runtime> = Runtime.knownValues().toSet()
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