// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.actions

import com.intellij.openapi.application.ApplicationManager
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.sqs.SqsQueueNode
import software.aws.toolkits.jetbrains.services.sqs.resources.SqsResources
import software.aws.toolkits.jetbrains.services.sqs.toolwindow.SqsWindow
import software.aws.toolkits.resources.message

class DeleteQueueAction : DeleteResourceAction<SqsQueueNode>(message("sqs.delete.queue.action")) {
    override fun performDelete(selected: SqsQueueNode) {
        val project = selected.nodeProject
        val client = project.awsClient<SqsClient>()
        ApplicationManager.getApplication().invokeAndWait {
            SqsWindow.getInstance(project).closeQueue(selected.queueUrl)
        }
        client.deleteQueue { it.queueUrl(selected.queueUrl) }
        project.refreshAwsTree(SqsResources.LIST_QUEUE_URLS)
    }

    override val comment: String = message("resource.delete.warning_text", "queue")
}
