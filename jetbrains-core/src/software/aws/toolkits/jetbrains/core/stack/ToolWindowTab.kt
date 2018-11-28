// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.core.stack

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindowAnchor
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.impl.ContentImpl
import javax.swing.JComponent

/**
 * Tab in tool window
 * [disposables] to be disposed when window is closed
 */
internal class ToolWindowTab(
    component: JComponent,
    private val project: Project,
    stackName: String,
    private val toolWindowId: String,
    private vararg val disposables: Disposable
) {

    private val content = ContentImpl(component, stackName, true)

    fun show() {
        val contentManager = window.contentManager
        contentManager.addContent(content)
        disposables.forEach { Disposer.register(content, it) }
        Disposer.register(content, Disposable { closeWindowIfEmpty() })
        window.activate(null, true)
        contentManager.setSelectedContent(content)
    }

    fun destroy() {
        if (!Disposer.isDisposed(content)) {
            window.contentManager.removeContent(content, true)
        }
    }

    private fun closeWindowIfEmpty() {
        if (window.contentManager.contentCount == 0) {
            windowManager.unregisterToolWindow(toolWindowId)
        }
    }

    private val windowManager get() = ToolWindowManager.getInstance(project)
    private val window
        get() = getWindow(toolWindowId, windowManager)
}

private fun getWindow(toolWindowId: String, manager: ToolWindowManager) = manager.getToolWindow(toolWindowId)
    ?: manager.registerToolWindow(toolWindowId, true, ToolWindowAnchor.BOTTOM)