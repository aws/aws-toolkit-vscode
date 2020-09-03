// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.sqs.SqsQueueNode
import software.aws.toolkits.jetbrains.services.sqs.toolwindow.SqsWindow
import software.aws.toolkits.resources.message

class PollMessageAction : SingleResourceNodeAction<SqsQueueNode>(message("sqs.poll.message")), DumbAware {
    override fun actionPerformed(selected: SqsQueueNode, e: AnActionEvent) {
        SqsWindow.getInstance(selected.nodeProject).pollMessage(selected.queue)
    }
}
