// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.components.JBLabel
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.settings.EcsExecCommandSettings
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcsTelemetry
import software.aws.toolkits.telemetry.Result
import javax.swing.JComponent

class EnableDisableExecuteCommandWarning(private val project: Project, private val enable: Boolean, private val serviceName: String) : DialogWrapper(project) {
    private val warningIcon = JBLabel(Messages.getWarningIcon())
    var dontDisplayWarning = false
    var confirmNonProduction = false
    private val settings = EcsExecCommandSettings.getInstance()
    private val component by lazy {
        panel {
            row {
                cell(warningIcon)
                label(message("ecs.execute_command_enable_warning")).visible(enable)
                label(message("ecs.execute_command_disable_warning")).visible(!enable)
            }

            row {
                checkBox(
                    message("ecs.execute_command.production_warning.checkbox_label", serviceName)
                )
                    .bindSelected({ confirmNonProduction }, { confirmNonProduction = it })
                    .errorOnApply(message("general.confirm_proceed")) { !it.isSelected }
            }

            row {
                checkBox(message("general.notification.action.hide_forever")).bindSelected({ dontDisplayWarning }, { dontDisplayWarning = it })
            }
        }
    }

    init {
        super.init()
        title = if (enable) {
            message("ecs.execute_command_enable_warning_title")
        } else {
            message("ecs.execute_command_disable_warning_title")
        }
    }

    override fun doOKAction() {
        super.doOKAction()
        if (dontDisplayWarning) {
            settings.showExecuteCommandWarning = false
        }
    }

    override fun doCancelAction() {
        super.doCancelAction()
        if (enable) {
            EcsTelemetry.enableExecuteCommand(project, Result.Cancelled)
        } else {
            EcsTelemetry.disableExecuteCommand(project, Result.Cancelled)
        }
    }

    override fun createCenterPanel(): JComponent = component

    override fun getHelpId(): String = HelpIds.ECS_EXEC_PERMISSIONS_REQUIRED.id
}
