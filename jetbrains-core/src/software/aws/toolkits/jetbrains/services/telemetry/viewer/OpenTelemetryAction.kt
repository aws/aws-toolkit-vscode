// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry.viewer

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.wm.RegisterToolWindowTask
import com.intellij.openapi.wm.ToolWindowManager

class OpenTelemetryAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.getRequiredData(CommonDataKeys.PROJECT)
        val id = "aws.telemetryViewer"
        val toolWindowManager = ToolWindowManager.getInstance(project)
        val toolWindow = toolWindowManager.getToolWindow(id) ?: run {
            val newToolWindow = toolWindowManager.registerToolWindow(
                RegisterToolWindowTask(
                    id = id,
                    component = TelemetryToolWindow(project),
                    canCloseContent = false,
                )
            )

            newToolWindow
        }

        toolWindow.show()
    }
}
