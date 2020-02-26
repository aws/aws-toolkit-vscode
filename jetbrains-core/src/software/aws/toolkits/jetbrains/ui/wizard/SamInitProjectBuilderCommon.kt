// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("SamInitProjectBuilderCommon")

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.ui.ValidationInfo
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.core.executables.getExecutableIfPresent
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.resources.message
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JTextField

interface ValidatablePanel {
    fun validate(): ValidationInfo? = null
}

@JvmOverloads
fun setupSamSelectionElements(samExecutableField: JTextField, editButton: JButton, label: JComponent, postEditCallback: Runnable? = null) {
    fun getSamExecutable(): ExecutableInstance.ExecutableWithPath? =
        ExecutableManager.getInstance().getExecutableIfPresent<SamExecutable>().let {
            if (it is ExecutableInstance.ExecutableWithPath) {
                it
            } else {
                null
            }
        }

    fun updateUi(validSamPath: Boolean) {
        runInEdt(ModalityState.any()) {
            samExecutableField.isVisible = !validSamPath
            editButton.isVisible = !validSamPath
            label.isVisible = !validSamPath
        }
    }

    samExecutableField.text = getSamExecutable()?.executablePath?.toString()

    editButton.addActionListener {
        ShowSettingsUtil.getInstance().showSettingsDialog(DefaultProjectFactory.getInstance().defaultProject, AwsSettingsConfigurable::class.java)
        samExecutableField.text = getSamExecutable()?.executablePath?.toString()
        postEditCallback?.run()
    }

    val toolTipText = message("aws.settings.find.description", "SAM")
    label.toolTipText = toolTipText
    samExecutableField.toolTipText = toolTipText
    editButton.toolTipText = toolTipText

    ExecutableManager.getInstance().getExecutable<SamExecutable>().thenAccept {
        val validSamPath = when (it) {
            is ExecutableInstance.Executable -> true
            else -> false
        }
        updateUi(validSamPath)
    }.exceptionally {
        updateUi(validSamPath = false)
        null
    }
}
