// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.BearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getConnectionStartUrl
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent

class CodeWhispererReconnectNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.explorer.reconnect"),
    0,
    AllIcons.Actions.Execute
) {
    override fun onDoubleClick(event: MouseEvent) {
        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        if (connection !is BearerSsoConnection) return
        ApplicationManager.getApplication().executeOnPooledThread {
            getConnectionStartUrl(connection)?.let { startUrl ->
                loginSso(project, startUrl, scopes = connection.scopes)
            }
        }
    }
}
