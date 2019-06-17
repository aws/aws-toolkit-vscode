// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.core.stack

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindowAnchor
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.impl.ContentImpl
import icons.AwsIcons
import software.aws.toolkits.resources.message
import javax.swing.JComponent

internal const val STACK_TOOLWINDOW_ID = "AWS.CloudFormation"

/**
 * Tab in tool window
 * [disposables] to be disposed when window is closed
 */
internal class ToolWindowTab(
    component: JComponent,
    private val project: Project,
    stackName: String,
    private vararg val disposables: Disposable
) {

    private val content = ContentImpl(component, stackName, true)

    init {
        val contentManager = window.contentManager
        contentManager.addContent(content)
        disposables.forEach { Disposer.register(content, it) }
        Disposer.register(content, Disposable { closeWindowIfEmpty() })
    }

    fun show() {
        window.activate(null, true)
        window.contentManager.setSelectedContent(content)
    }

    fun destroy() {
        if (!Disposer.isDisposed(content)) {
            window.contentManager.removeContent(content, true)
        }
    }

    fun isDisposed() = Disposer.isDisposed(content)

    private fun closeWindowIfEmpty() {
        if (window.contentManager.contentCount == 0) {
            windowManager.unregisterToolWindow(STACK_TOOLWINDOW_ID)
        }
    }

    private val windowManager
        get() = ToolWindowManager.getInstance(project)
    private val window
        get() = windowManager.getToolWindow(STACK_TOOLWINDOW_ID)
            ?: windowManager.registerToolWindow(STACK_TOOLWINDOW_ID, true, ToolWindowAnchor.BOTTOM, project, true).also {
                it.icon = AwsIcons.Logos.CLOUD_FORMATION_TOOL
                it.stripeTitle = message("cloudformation.toolwindow.label")
            }
}