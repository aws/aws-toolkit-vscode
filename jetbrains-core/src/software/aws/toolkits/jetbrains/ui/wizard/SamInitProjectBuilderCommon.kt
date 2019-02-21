// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("SamInitProjectBuilderCommon")

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.VirtualFile
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamCommon
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.jetbrains.settings.SamSettings
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JTextField

abstract class SamProjectTemplate {
    abstract fun getName(): String

    open fun getDescription(): String? = null

    override fun toString() = getName()

    fun getIcon() = AwsIcons.Resources.SERVERLESS_APP

    fun build(runtime: Runtime, outputDir: VirtualFile) {
        doBuild(runtime, outputDir)
        TelemetryService.getInstance().record("SamProjectInit") {
            datum(getName()) {
                metadata("runtime", runtime.name)
                metadata("samVersion", SamCommon.getVersionString())
            }
        }
    }

    protected open fun doBuild(runtime: Runtime, outputDir: VirtualFile) {
        SamInitRunner(AwsModuleType.ID, outputDir, runtime).execute()
    }

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