// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.resources.message

class Customize : DumbAwareAction(
    { message("codewhisperer.explorer.customization.select") },
    AwsIcons.Resources.CodeWhisperer.CUSTOM
) {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val project = e.project ?: return
        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        val activeCustomization = CodeWhispererModelConfigurator.getInstance().activeCustomization(project)

        if (connection != null) {
            val newCount = CodeWhispererModelConfigurator.getInstance().getNewUpdate(connection.id)?.count { it.isNew } ?: 0

            val suffix = if (newCount > 0) {
                " ($newCount new)"
            } else if (activeCustomization != null) {
                " ${activeCustomization.name}"
            } else {
                ""
            }

            e.presentation.text = message("codewhisperer.explorer.customization.select") + suffix
        }
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        CodeWhispererModelConfigurator.getInstance().showConfigDialog(project)
    }
}
