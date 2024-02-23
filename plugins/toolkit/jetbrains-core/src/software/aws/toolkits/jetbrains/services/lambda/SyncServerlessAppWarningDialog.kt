// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.jetbrains.settings.SamDisplayDevModeWarningSettings
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class SyncServerlessAppWarningDialog(private val project: Project) : DialogWrapper(project) {
    private val settings = SamDisplayDevModeWarningSettings.getInstance()
    private val dontDisplayWarning = JBCheckBox(message("general.notification.action.hide_forever")).also {
        it.isSelected = false
    }
    private val component by lazy {
        panel {
            row {
                label(
                    message("serverless.application.sync.dev.mode.warning.text")
                )
            }
            row {
                cell(dontDisplayWarning)
            }
        }
    }

    init {
        super.init()
        title = message("serverless.application.sync.confirm.dev.stack.title")
        setOKButtonText(message("general.confirm"))
    }

    override fun createCenterPanel(): JComponent? = component

    override fun doOKAction() {
        super.doOKAction()
        if (dontDisplayWarning.isSelected) {
            settings.showDevModeWarning = false
        }
    }
}
