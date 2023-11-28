// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBScrollPane
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend

class CodeWhispererCodeReferenceToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val toolWindowContent = toolWindow.contentManager.factory.createContent(
            JBScrollPane(CodeWhispererCodeReferenceManager.getInstance(project).codeReferenceComponents.contentPanel, 20, 30),
            null,
            false
        )

        toolWindowContent.isCloseable = false
        toolWindow.contentManager.addContent(toolWindowContent)
    }

    override fun shouldBeAvailable(project: Project): Boolean = isCodeWhispererEnabled(project) && !isRunningOnRemoteBackend()

    companion object {
        const val id = "aws.codewhisperer.codereference"
    }
}
