// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent

class OpenCodeReferenceNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.explorer.code_reference.open"),
    3,
    AllIcons.Actions.Preview
) {
    override fun onDoubleClick(event: MouseEvent) {
        CodeWhispererCodeReferenceManager.getInstance(project).showCodeReferencePanel()
    }
}
