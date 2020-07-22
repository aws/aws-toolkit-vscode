// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBTabbedPane
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.resources.message

// Will add more parameters once window is populated
class SqsWindowUI(private val project: Project, val queue: Queue) {
    val mainPanel = JBTabbedPane().apply {
        this.add(message("sqs.queue.polled.messages"), PollMessagePane().component)
        this.add(message("sqs.send.message"), SendMessagePane().component)
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
