// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.reconnectCodeWhisperer
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import java.awt.event.MouseEvent

class CodeWhispererReconnectNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.explorer.reconnect"),
    0,
    AllIcons.Actions.Execute
) {
    override fun onDoubleClick(event: MouseEvent) {
        UiTelemetry.click(project, "ReconnectNode")
        reconnectCodeWhisperer(project)
    }
}
