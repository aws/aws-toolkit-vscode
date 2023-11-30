// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.analysis.problemsView.toolWindow.ProblemsView
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ex.ToolWindowManagerListener
import com.intellij.openapi.wm.impl.status.widget.StatusBarWidgetsManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.core.explorer.refreshCwQTree
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomizationListener
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererActivationChangedListener
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.status.CodeWhispererStatusBarWidgetFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager

class CodeWhispererProjectStartupSettingsListener(private val project: Project) :
    CodeWhispererActivationChangedListener,
    ToolWindowManagerListener,
    ToolkitConnectionManagerListener,
    BearerTokenProviderListener,
    CodeWhispererCustomizationListener {
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
        if (!isCodeWhispererEnabled(project)) return
        CodeWhispererCodeScanManager.getInstance(project).addCodeScanUI()
    }

    override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
        // For now we have the assumption that any connection change will include CW
        // will need to change if we separate CW connections and CodeCatalyst connections
        runInEdt {
            CodeWhispererCodeReferenceManager.getInstance(project).toolWindow?.isAvailable = newConnection != null
        }
        if (newConnection != null) {
            CodeWhispererCodeScanManager.getInstance(project).addCodeScanUI()
        } else {
            CodeWhispererCodeScanManager.getInstance(project).removeCodeScanUI()
        }

        ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let {
            // re-check the allowlist status
            CodeWhispererModelConfigurator.getInstance().shouldDisplayCustomNode(project, forceUpdate = true)
        }

        project.refreshCwQTree()
    }

    override fun refreshUi() {
        ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let { curConnection ->
            if (curConnection.isSono()) {
                return
            }

            project.refreshCwQTree()
        }
    }
}
