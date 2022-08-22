// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.toolwindow

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.Content
import javax.swing.JComponent

interface ToolkitToolWindow {
    val project: Project
    val toolWindowId: String

    fun toolWindow() = ToolWindowManager.getInstance(project).getToolWindow(toolWindowId)
        ?: throw IllegalStateException("Can't find tool window $toolWindowId")

    /**
     * Adds a new tab to the tool window
     *
     * @param title Title of the tab
     * @param component The JComponent of the tab's content. If [Disposable] will be auto disposed on close
     * @param activate Show the tab upon adding it
     * @param id Unique ID to identify the tab
     * @param additionalDisposable An additional [Disposable] to dispose when the tab is closed
     */
    fun addTab(
        title: String,
        component: JComponent,
        activate: Boolean = false,
        id: String = title,
        additionalDisposable: Disposable? = null
    ): Content {
        val toolWindow = toolWindow()
        val contentManager = toolWindow.contentManager
        val content = contentManager.factory.createContent(component, title, false).also {
            it.isCloseable = true
            it.isPinnable = true
            it.putUserData(AWS_TOOLKIT_TAB_ID_KEY, id)

            if (additionalDisposable != null) {
                it.setDisposer(additionalDisposable)
            }
        }

        contentManager.addContent(content)
        if (activate) {
            show(content)
        }

        return content
    }

    fun removeContent(content: Content) = runInEdt {
        val toolWindow = toolWindow()
        toolWindow.contentManager.removeContent(content, true)
    }

    fun show(content: Content) {
        val toolWindow = toolWindow()
        toolWindow.activate(null, true)
        toolWindow.contentManager.setSelectedContent(content)
    }

    fun showExistingContent(id: String): Boolean {
        val toolWindow = toolWindow()

        val content = find(id)
        if (content != null) {
            runInEdt {
                toolWindow.activate(null, true)
                toolWindow.contentManager.setSelectedContent(content)
            }

            return true
        }

        return false
    }

    fun find(id: String): Content? =
        toolWindow().contentManager.contents.find { id == it.getUserData(AWS_TOOLKIT_TAB_ID_KEY) }

    // prefix is prefix of the id. Assumes the window is using id composed of paths, like: "loggroup/logstream"
    fun findPrefix(prefix: String): List<Content> {
        val toolWindow = toolWindow()

        return toolWindow.contentManager.contents.filter {
            val key = it.getUserData(AWS_TOOLKIT_TAB_ID_KEY) ?: ""
            key.startsWith("$prefix/") || key == prefix
        }
    }

    companion object {
        private val AWS_TOOLKIT_TAB_ID_KEY = Key.create<String>("awsToolkitTabId")
    }
}
