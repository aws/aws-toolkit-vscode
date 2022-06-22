// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.ui.content.Content
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.DevToolsToolWindow
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindow
import software.aws.toolkits.jetbrains.services.codewhisperer.experiment.CodeWhispererExperiment
import software.aws.toolkits.resources.message

class AwsToolkitExplorerToolWindow(override val project: Project) : ToolkitToolWindow {
    private lateinit var devToolsContent: Content
    override val toolWindowId = AwsToolkitExplorerFactory.TOOLWINDOW_ID
    init {
        runInEdt {
            addTab(
                message("explorer.toolwindow.title"),
                ExplorerToolWindow.getInstance(project),
                activate = true,
                id = EXPLORER_TAB_ID,
                additionalDisposable = null
            )
            devToolsContent = addTab(
                message("aws.developer.tools.tab.title"),
                DevToolsToolWindow.getInstance(project),
                activate = false,
                id = DEVTOOLS_TAB_ID,
                additionalDisposable = null
            )
            // Hide dev tool on initialization if CodeWhisperer is not enabled in experimental feature.
            // We can do this since CodeWhisperer is the only node in Dev Tool pane for now.
            if (!CodeWhispererExperiment.isEnabled()) {
                setDevToolsTabVisible(false)
            }
        }
    }

    fun setDevToolsTabVisible(visible: Boolean) {
        val content = find(DEVTOOLS_TAB_ID)
        if (!visible) {
            content?.let {
                // only hide the compoenet instead of dispoing all of them
                toolWindow().contentManager.removeContent(it, false)
            }
            return
        }

        content?.let {
            // shouldn't be here
            show(it)
        } ?: run {
            toolWindow().contentManager.addContent(this.devToolsContent)
            show(this.devToolsContent)
        }
    }

    companion object {
        private const val EXPLORER_TAB_ID = "aws.toolkit.explorer"
        const val DEVTOOLS_TAB_ID = "aws.toolkit.developer.tools"

        fun getInstance(project: Project) = project.service<AwsToolkitExplorerToolWindow>()
    }
}
