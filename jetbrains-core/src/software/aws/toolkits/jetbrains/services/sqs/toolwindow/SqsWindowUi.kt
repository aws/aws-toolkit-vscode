// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBTabbedPane
import com.intellij.util.ui.JBUI
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.resources.message

class SqsWindowUi(private val project: Project, private val client: SqsClient, val queue: Queue) {
    val mainPanel = JBTabbedPane().apply {
        tabComponentInsets = JBUI.emptyInsets()
        border = JBUI.Borders.empty()
        add(message("sqs.queue.polled.messages"), PollMessagePane(client, queue).component)
        add(message("sqs.send.message"), SendMessagePane(project, client, queue).component)
    }

    fun pollMessage() {
        mainPanel.selectedIndex = POLL_MESSAGE_PANE
    }

    fun sendMessage() {
        mainPanel.selectedIndex = SEND_MESSAGE_PANE
    }

    companion object {
        const val POLL_MESSAGE_PANE = 0
        const val SEND_MESSAGE_PANE = 1
    }
}
