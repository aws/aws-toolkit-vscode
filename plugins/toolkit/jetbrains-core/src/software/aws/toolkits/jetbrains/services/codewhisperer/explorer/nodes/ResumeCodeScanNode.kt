// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent

class ResumeCodeScanNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.explorer.resume_auto_scans"),
    1,
    AllIcons.Actions.Resume
) {

    override fun onDoubleClick(event: MouseEvent) {
        CodeWhispererExplorerActionManager.getInstance().SetAutoCodeScan(project, true)
    }
}
