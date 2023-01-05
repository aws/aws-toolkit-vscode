// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent

class RunCodeScanNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.codescan.run_scan"),
    2,
    CodeWhispererCodeScanManager.getInstance(nodeProject).getActionButtonIcon()
) {
    override fun onDoubleClick(event: MouseEvent) {
        CodeWhispererCodeScanManager.getInstance(project).runCodeScan()
    }
}
