// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.reauthConnectionIfNeeded
import software.aws.toolkits.jetbrains.core.explorer.refreshCwQTree
import software.aws.toolkits.jetbrains.core.gettingstarted.requestCredentialsForCodeWhisperer
import software.aws.toolkits.jetbrains.services.amazonq.gettingstarted.openMeetQPage
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.startup.CodeWhispererProjectStartupActivity
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import java.awt.event.MouseEvent

class GetStartedNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("q.sign.in"),
    0,
    AllIcons.CodeWithMe.CwmAccess
) {
    override fun onDoubleClick(event: MouseEvent) {
        enableCodeWhisperer(project)
        UiTelemetry.click(project, "cw_signUp_Cta")
        UiTelemetry.click(project, "auth_start_CodeWhisperer")
    }

    /**
     * 2 cases
     * (1) User who don't have SSO based connection click on CodeWhisperer Start node
     * (2) User who already have SSO based connection from previous operation via i.g. Toolkit Add Connection click on CodeWhisperer Start node
     */
    private fun enableCodeWhisperer(project: Project) {
        val connectionManager = ToolkitConnectionManager.getInstance(project)
        connectionManager.activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let {
            project.refreshCwQTree()
            reauthConnectionIfNeeded(project, it)
        } ?: run {
            runInEdt {
                // Start from scratch if no active connection
                if (requestCredentialsForCodeWhisperer(project)) {
                    project.refreshCwQTree()
                    if (!openMeetQPage(project)) {
                        return@runInEdt
                    }
                }
            }
        }

        if (isCodeWhispererEnabled(project)) {
            StartupActivity.POST_STARTUP_ACTIVITY.findExtension(CodeWhispererProjectStartupActivity::class.java)?.let {
                it.runActivity(project)
            }
        }
    }
}
