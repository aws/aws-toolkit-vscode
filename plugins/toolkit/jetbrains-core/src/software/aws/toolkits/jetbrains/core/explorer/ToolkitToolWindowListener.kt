// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ex.ToolWindowEx
import software.aws.toolkits.resources.message

class ToolkitToolWindowListener(project: Project) {
    private val toolWindow by lazy { AwsToolkitExplorerToolWindow.toolWindow(project) }
    private val actionManager by lazy { ActionManager.getInstance() }
    private val explorerActions by lazy { listOf(actionManager.getAction("aws.toolkit.explorer.titleBar")) }

    private val developerToolsActions by lazy {
        listOf(
            actionManager.getAction("aws.toolkit.showFeedback")
        )
    }
    private val cwQActions by lazy {
        listOf(
            actionManager.getAction("aws.toolkit.showFeedback")
        )
    }

    fun tabChanged(tabName: String) {
        // compiler can't smart cast since property is lazy and therefore has a custom getter
        toolWindow.let {
            if (it is ToolWindowEx) {
                if (tabName == message("explorer.toolwindow.title")) {
                    it.setTitleActions(explorerActions)
                } else if (tabName == message("aws.developer.tools.tab.title")) {
                    it.setTitleActions(developerToolsActions)
                } else if (tabName == message("aws.codewhispererq.tab.title")) {
                    it.setTitleActions(cwQActions)
                }
            }
        }
    }
}
