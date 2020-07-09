// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.openapi.project.Project
import com.intellij.icons.AllIcons
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.CacheBackedAwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.services.sqs.resources.SqsResources

class SqsServiceNode(
    project: Project,
    service: AwsExplorerServiceNode
) : CacheBackedAwsExplorerServiceRootNode<String>(
    project,
    service,
    SqsResources.LIST_QUEUE_URLS
) {
    override fun toNode(child: String): AwsExplorerNode<*> = SqsQueueNode(nodeProject, child)
}

class SqsQueueNode(
    project: Project,
    val queueUrl: String
) : AwsExplorerResourceNode<String>(
    project,
    SqsClient.SERVICE_NAME,
    queueUrl,
    AllIcons.Nodes.EmptyNode // TODO: Get & change icons
) {
    private val queue = Queue(queueUrl, nodeProject.activeRegion())

    override fun resourceType() = "queue"

    override fun resourceArn(): String = queue.arn

    override fun displayName(): String = queue.queueName

    override fun onDoubleClick() {
        // TODO: create SQS tool window
    }
}
