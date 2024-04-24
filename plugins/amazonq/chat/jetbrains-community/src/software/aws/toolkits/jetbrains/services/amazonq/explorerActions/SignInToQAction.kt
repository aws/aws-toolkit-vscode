// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.explorerActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.jcef.JBCefApp
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.core.credentials.reauthConnectionIfNeeded
import software.aws.toolkits.jetbrains.core.gettingstarted.requestCredentialsForQ
import software.aws.toolkits.jetbrains.services.amazonq.gettingstarted.openMeetQPage
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindowFactory
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry

class SignInToQAction : SignInToQActionBase(message("q.sign.in")) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        UiTelemetry.click(project, "auth_start_Q")

        if (!JBCefApp.isSupported()) {
            requestCredentialsForQ(project)
        } else {
            ToolWindowManager.getInstance(project).getToolWindow(AmazonQToolWindowFactory.WINDOW_ID)?.show()
        }
    }
}

class EnableQAction : SignInToQActionBase(message("q.enable.text"))

abstract class SignInToQActionBase(actionName: String) : DumbAwareAction(actionName, null, AllIcons.CodeWithMe.CwmAccess) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        UiTelemetry.click(project, "auth_start_Q")
        val connectionManager = ToolkitConnectionManager.getInstance(project)
        connectionManager.activeConnectionForFeature(QConnection.getInstance())?.let {
            reauthConnectionIfNeeded(project, it)
        } ?: run {
            runInEdt {
                if (requestCredentialsForQ(project)) {
                    if (!openMeetQPage(project)) {
                        return@runInEdt
                    }
                }
            }
        }
    }
}
