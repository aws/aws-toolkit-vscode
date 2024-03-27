// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.wm.ToolWindowManager
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindowFactory
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeModernizerManager
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeTransformTelemetryManager
import software.aws.toolkits.jetbrains.services.codemodernizer.commands.CodeTransformMessageListener
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformCancelSrcComponents

class CodeModernizerStopModernizerAction :
    AnAction(
        message("codemodernizer.explorer.stop_migration_job"),
        null,
        AllIcons.Actions.Suspend
    ),
    DumbAware {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(event: AnActionEvent) {
        val project = event.project ?: return
        val codeModernizerManager = CodeModernizerManager.getInstance(project)
        event.presentation.isVisible = codeModernizerManager.isModernizationJobActive()
        event.presentation.isEnabled = codeModernizerManager.isModernizationJobActive() && !codeModernizerManager.isModernizationJobStopping()
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return

        runInEdt {
            val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(AmazonQToolWindowFactory.WINDOW_ID)
            toolWindow?.show()
        }
        CodeTransformMessageListener.instance.onStopClicked()
        CodeTransformTelemetryManager.getInstance(project)
            .jobIsCancelledByUser(CodeTransformCancelSrcComponents.BottomPanelSideNavButton)
    }
}
