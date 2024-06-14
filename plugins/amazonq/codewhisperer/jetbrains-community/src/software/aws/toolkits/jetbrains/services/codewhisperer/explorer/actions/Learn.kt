// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererEditorProvider
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry

class Learn : DumbAwareAction(
    { message("codewhisperer.explorer.learn") },
    AwsIcons.Misc.LEARN
) {
    override fun actionPerformed(e: AnActionEvent) {
        UiTelemetry.click(e.project, "codewhisperer_Learn_ButtonClick")
        val project = e.project ?: return

        LearnCodeWhispererEditorProvider.openEditor(project)
    }
}
