// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererEditorProvider
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import java.awt.event.MouseEvent

class LearnCodeWhispererNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.explorer.learn"),
    4,
    AwsIcons.Misc.LEARN
) {
    override fun onDoubleClick(event: MouseEvent) {
        UiTelemetry.click(project, "codewhisperer_Learn_ButtonClick")
        LearnCodeWhispererEditorProvider.openEditor(project)
    }
}
