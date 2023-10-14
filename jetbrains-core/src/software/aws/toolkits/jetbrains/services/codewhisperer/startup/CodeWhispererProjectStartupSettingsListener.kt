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
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.core.explorer.refreshDevToolTree
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererActivationChangedListener
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererExpired
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererEditorProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.status.CodeWhispererStatusBarWidgetFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager

class CodeWhispererProjectStartupSettingsListener(private val project: Project) :
    CodeWhispererActivationChangedListener,
    ToolWindowManagerListener,
    ToolkitConnectionManagerListener,
    BearerTokenProviderListener {
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

        // TODO: Move this IF block into nullifyAccountlessCredentialIfNeeded()
        if (newConnection is AwsBearerTokenConnection) {
            CodeWhispererExplorerActionManager.getInstance().nullifyAccountlessCredentialIfNeeded()
        }
        project.refreshDevToolTree()
    }

    override fun onChange(providerId: String) {
        if (CodeWhispererExplorerActionManager.getInstance().hasShownNewOnboardingPage() || isCodeWhispererExpired(project)) {
            return
        }
        LearnCodeWhispererEditorProvider.openEditor(project)
    }
}
