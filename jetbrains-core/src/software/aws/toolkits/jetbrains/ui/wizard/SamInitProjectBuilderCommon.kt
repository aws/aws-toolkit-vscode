// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("SamInitProjectBuilderCommon")

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.text.StringUtil
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.resources.message
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JTextField

interface ValidatablePanel {
    fun validate(): ValidationInfo? = null
}

@JvmOverloads
fun setupSamSelectionElements(samExecutableField: JTextField, editButton: JButton, label: JComponent, postEditCallback: Runnable? = null) {
    samExecutableField.text = SamSettings.getInstance().executablePath

    editButton.addActionListener {
        ShowSettingsUtil.getInstance().showSettingsDialog(DefaultProjectFactory.getInstance().defaultProject, AwsSettingsConfigurable::class.java)
        samExecutableField.text = SamSettings.getInstance().executablePath
        postEditCallback?.run()
    }

    val samExe = samExecutableField.text

    ProgressManager.getInstance().run(object : Task.Backgroundable(null, message("lambda.run_configuration.sam.validating"), false) {
        override fun run(indicator: ProgressIndicator) {
            val validSamPath = (SamCommon.validate(StringUtil.nullize(samExe)) == null)
            runInEdt {
                samExecutableField.isVisible = !validSamPath
                editButton.isVisible = !validSamPath
                label.isVisible = !validSamPath
            }
        }
    })
}

@JvmOverloads
fun validateSamForSchemaSupport(samExecutableField: JTextField, editButton: JButton, label: JComponent) {
    val samExe = samExecutableField.text

    ProgressManager.getInstance().run(object : Task.Backgroundable(null, message("lambda.run_configuration.sam.validating_schema_version"), false) {
        override fun run(indicator: ProgressIndicator) {
            val validSamPath = (SamCommon.validateSchemasSupport(StringUtil.nullize(samExe)) == null)
            runInEdt {
                samExecutableField.isVisible = !validSamPath
                editButton.isVisible = !validSamPath
                label.isVisible = !validSamPath
            }
        }
    })
}
