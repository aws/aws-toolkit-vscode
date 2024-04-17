// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.toolwindow

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBScrollPane
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers.CodeModernizerBottomWindowPanelManager
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.isCodeTransformAvailable
import software.aws.toolkits.resources.message

class CodeModernizerBottomToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val toolWindowContent = toolWindow.contentManager.factory.createContent(
            JBScrollPane(CodeModernizerBottomWindowPanelManager.getInstance(project).setPreviousJobHistoryUI(false)),
            null,
            false
        )
        toolWindowContent.isCloseable = false
        toolWindow.contentManager.addContent(toolWindowContent)

        runInEdt {
            toolWindow.installWatcher(toolWindow.contentManager)
        }
    }

    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("codemodernizer.toolwindow.label_no_job")
    }
    override fun shouldBeAvailable(project: Project): Boolean =
        isCodeTransformAvailable(project)

    companion object {
        const val id = "aws.codewhisperer.codetransform"
    }
}
