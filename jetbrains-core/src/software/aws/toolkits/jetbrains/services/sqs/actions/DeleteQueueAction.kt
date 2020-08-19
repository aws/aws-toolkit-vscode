// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.actions

import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.sqs.SqsQueueNode
import software.aws.toolkits.jetbrains.services.sqs.resources.SqsResources
import software.aws.toolkits.jetbrains.services.sqs.toolwindow.SqsWindow
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.resources.message

class DeleteQueueAction : DeleteResourceAction<SqsQueueNode>(message("sqs.delete.queue.action"), TaggingResourceType.SQS_QUEUE) {
    override fun performDelete(selected: SqsQueueNode) {
        val client = selected.nodeProject.awsClient<SqsClient>()
        SqsWindow.getInstance(selected.nodeProject).closeQueue(selected.queueUrl)
        client.deleteQueue { it.queueUrl(selected.queueUrl) }
        selected.nodeProject.refreshAwsTree(SqsResources.LIST_QUEUE_URLS)
    }
}
