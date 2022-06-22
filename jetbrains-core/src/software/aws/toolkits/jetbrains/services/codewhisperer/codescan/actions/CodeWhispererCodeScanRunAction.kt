// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.resources.message

class CodeWhispererCodeScanRunAction : DumbAwareAction(
    message("codewhisperer.codescan.run_scan"),
    null,
    AllIcons.Actions.Execute
) {
    override fun update(event: AnActionEvent) {
        event.presentation.isEnabledAndVisible =
            CodeWhispererExplorerActionManager.getInstance().hasAcceptedTermsOfService()
        val project = event.project ?: return
        val scanManager = CodeWhispererCodeScanManager.getInstance(project)
        event.presentation.icon = scanManager.getActionButtonIcon()
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        CodeWhispererCodeScanManager.getInstance(project).runCodeScan()
    }
}
