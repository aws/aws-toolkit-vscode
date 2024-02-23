// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.components.JBLabel
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.resources.message
import javax.swing.Action
import javax.swing.JComponent

class TaskRoleNotFoundWarningDialog(project: Project) : DialogWrapper(project) {
    private val warningIcon = JBLabel(Messages.getWarningIcon())
    private val warningMessage = JBLabel(message("ecs.execute_command_task_role_invalid_warning"))
    private val component by lazy {
        panel {
            row {
                cell(warningIcon)
                cell(warningMessage).also { it.component.setCopyable(true) }
            }
        }
    }

    init {
        super.init()
        title = message("ecs.execute_command_task_role_invalid_warning_title")
    }

    // Overriden to remove the Cancel button
    override fun createActions(): Array<Action> = arrayOf(okAction)

    override fun createCenterPanel(): JComponent? = component
}
