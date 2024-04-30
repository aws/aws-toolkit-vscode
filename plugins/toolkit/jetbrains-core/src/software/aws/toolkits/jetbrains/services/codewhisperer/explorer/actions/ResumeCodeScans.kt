// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isUserBuilderId
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.resources.message

class ResumeCodeScans : DumbAwareAction(
    { message("codewhisperer.explorer.resume_auto_scans") },
    AllIcons.Actions.Resume
) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        val actionManager = CodeWhispererExplorerActionManager.getInstance()
        actionManager.setAutoCodeScan(project, true)
        //  Run Proactive Code File Scan once toggle is enabled
        if (!actionManager.isMonthlyQuotaForCodeScansExceeded() && !isUserBuilderId(project)) {
            CodeWhispererCodeScanManager.getInstance(project).debouncedRunCodeScan(CodeWhispererConstants.CodeAnalysisScope.FILE)
        }
    }
}
