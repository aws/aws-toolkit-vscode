// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel
import software.aws.toolkits.telemetry.UiTelemetry

class ExplorerNewConnectionAction : DumbAwareAction(AllIcons.General.Add) {
    override fun displayTextInToolbar() = true

    override fun actionPerformed(e: AnActionEvent) {
        e.project?.let {
            runInEdt {
                GettingStartedPanel.openPanel(it)
                UiTelemetry.click(it, "devtools_connectToAws")
            }
        }
    }
}
