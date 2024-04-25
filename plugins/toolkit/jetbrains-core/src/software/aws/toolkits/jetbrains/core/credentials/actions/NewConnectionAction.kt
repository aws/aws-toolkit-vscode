// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.core.explorer.showWebview
import software.aws.toolkits.jetbrains.core.explorer.webview.ToolkitWebviewPanel
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel
import software.aws.toolkits.jetbrains.core.gettingstarted.shouldShowNonWebviewUI
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.UiTelemetry

class NewConnectionAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        e.project?.let {
            runInEdt {
                if (shouldShowNonWebviewUI()) {
                    GettingStartedPanel.openPanel(it, connectionInitiatedFromExplorer = true)
                } else {
                    ToolkitWebviewPanel.getInstance(it).browser?.prepareBrowser(BrowserState(FeatureId.AwsExplorer, true))
                    showWebview(it)
                }
                UiTelemetry.click(e.project, "auth_gettingstarted_explorermenu")
            }
        }
    }
}
