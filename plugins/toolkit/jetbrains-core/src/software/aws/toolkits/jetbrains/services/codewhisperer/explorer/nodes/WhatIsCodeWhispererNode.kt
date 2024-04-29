// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import java.awt.event.MouseEvent
import java.net.URI

class WhatIsCodeWhispererNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.explorer.what_is"),
    1,
    AllIcons.Actions.Help
) {
    override fun onDoubleClick(event: MouseEvent) {
        BrowserUtil.browse(URI(CodeWhispererConstants.Q_MARKETPLACE_URI))
        UiTelemetry.click(project, "cw_learnMore_Cta")
    }
}
