// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.util.messages.Topic
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindow
import software.aws.toolkits.resources.AmazonQBundle
import software.aws.toolkits.resources.message
import java.util.EventListener

class QRefreshPanelAction : DumbAwareAction(AmazonQBundle.message("amazonq.refresh.panel"), null, AllIcons.Actions.Refresh) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        // recreate chat browser
        AmazonQToolWindow.getInstance(project).disposeAndRecreate()
        // recreate signin browser
        QWebviewPanel.getInstance(project).disposeAndRecreate()
        RefreshQChatPanelButtonPressedListener.notifyRefresh()
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT
}

interface RefreshQChatPanelButtonPressedListener : EventListener {
    fun onRefresh() {}

    companion object {
        @Topic.AppLevel
        val TOPIC = Topic.create("Q Chat refreshed", RefreshQChatPanelButtonPressedListener::class.java)

        fun notifyRefresh() {
            ApplicationManager.getApplication().messageBus.syncPublisher(TOPIC).onRefresh()
        }
    }
}
