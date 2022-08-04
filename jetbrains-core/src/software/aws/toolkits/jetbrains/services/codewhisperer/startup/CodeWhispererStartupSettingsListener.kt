// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.analysis.problemsView.toolWindow.ProblemsView
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ex.ToolWindowManagerListener
import com.intellij.openapi.wm.impl.status.widget.StatusBarWidgetsManager
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererActivationChangedListener
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.status.CodeWhispererStatusBarWidgetFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager

class CodeWhispererStartupSettingsListener(private val project: Project) :
    CodeWhispererActivationChangedListener,
    ToolWindowManagerListener {
    override fun activationChanged(value: Boolean) {
        project.service<StatusBarWidgetsManager>().updateWidget(CodeWhispererStatusBarWidgetFactory::class.java)
        CodeWhispererCodeReferenceManager.getInstance(project).toolWindow?.isAvailable = value
        if (value) {
            CodeWhispererSettings.getInstance().toggleIncludeCodeWithReference(true)
            CodeWhispererCodeScanManager.getInstance(project).addCodeScanUI()
        } else {
            CodeWhispererCodeScanManager.getInstance(project).removeCodeScanUI()
        }
    }

    override fun toolWindowShown(toolWindow: ToolWindow) {
        super.toolWindowShown(toolWindow)
        if (toolWindow.id != ProblemsView.ID) return
        if (!CodeWhispererExplorerActionManager.getInstance().hasAcceptedTermsOfService()) return
        CodeWhispererCodeScanManager.getInstance(project).addCodeScanUI()
    }
}
