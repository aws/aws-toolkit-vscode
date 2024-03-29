// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.wm.ToolWindowManager
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AMAZON_Q_WINDOW_ID
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry

class QOpenPanelAction : AnAction(message("action.q.openchat.text"), null, AwsIcons.Logos.AWS_Q) {
    override fun actionPerformed(e: AnActionEvent) {
        if (isRunningOnRemoteBackend() || !isQSupportedInThisVersion()) return
        val project = e.getRequiredData(CommonDataKeys.PROJECT)
        UiTelemetry.click(project, "q_openChat")
        ToolWindowManager.getInstance(project).getToolWindow(AMAZON_Q_WINDOW_ID)?.activate(null, true)
    }
}
