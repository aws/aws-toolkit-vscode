// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("SamInitProjectBuilderCommon")

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.ide.util.projectWizard.ModuleBuilder
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.ProjectTemplate
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamInitRunner
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.jetbrains.ui.wizard.java.SamInitModuleBuilder
import software.aws.toolkits.resources.message
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JTextField

class SamProjectTemplateWrapper(
    val samProjectTemplate: SamProjectTemplate,
    val builder: ModuleBuilder
) : ProjectTemplate {
    override fun getIcon() = samProjectTemplate.getIcon()

    override fun getName() = samProjectTemplate.getName()

    override fun getDescription() = samProjectTemplate.getDescription()

    override fun createModuleBuilder() = builder

    override fun validateSettings() = null
}

abstract class SamProjectTemplate {
    abstract fun getName(): String

    open fun getDescription(): String? = null

    override fun toString() = getName()

    fun getIcon() = AwsIcons.Resources.SERVERLESS_APP

    open fun build(runtime: Runtime, outputDir: VirtualFile) {
        SamInitRunner(SamModuleType.ID, outputDir, runtime).execute()
    }

    fun getModuleBuilderProjectTemplate(builder: ModuleBuilder) =
            SamProjectTemplateWrapper(this, builder)
}

class SamModuleType : ModuleType<SamInitModuleBuilder>(ID) {
    override fun getNodeIcon(isOpened: Boolean) = AwsIcons.Resources.SERVERLESS_APP

    override fun createModuleBuilder() = SamInitModuleBuilder()

    override fun getName() = ID

    override fun getDescription() = DESCRIPTION

    companion object {
        val ID = message("sam.init.name")
        val DESCRIPTION = message("sam.init.description")
        val instance = SamModuleType()
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