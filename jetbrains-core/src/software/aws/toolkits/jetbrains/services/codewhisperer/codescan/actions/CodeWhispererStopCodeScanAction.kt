// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.resources.message

class CodeWhispererStopCodeScanAction : DumbAwareAction(
    message("codewhisperer.codescan.stop_scan"),
    null,
    AllIcons.Actions.Suspend
) {
    override fun update(event: AnActionEvent) {
        val project = event.project ?: return
        val scanManager = CodeWhispererCodeScanManager.getInstance(project)
        event.presentation.isEnabled = scanManager.isCodeScanJobActive()
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        CodeWhispererCodeScanManager.getInstance(project).stopCodeScan()
    }
}
