// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.PurgeQueueInProgressException
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.sqs.SqsQueueNode
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class PurgeQueueAction :
    SingleResourceNodeAction<SqsQueueNode>(message("sqs.purge_queue")),
    CoroutineScope by ApplicationThreadPoolScope("PurgeQueueAction "),
    DumbAware {
    override fun actionPerformed(selected: SqsQueueNode, e: AnActionEvent) {
        val project = selected.nodeProject
        val client: SqsClient = project.awsClient()
        launch {
            try {
                client.purgeQueue { it.queueUrl(selected.queueUrl) }
                LOG.info { "Started purging ${selected.queueUrl}" }
                notifyInfo(
                    project = project,
                    title = message("aws.notification.title"),
                    content = message("sqs.purge_queue.succeeded", selected.queueUrl)
                )
            } catch (e: PurgeQueueInProgressException) {
                LOG.warn { "${selected.queueUrl} already has a query purge in progress" }
                notifyError(
                    project = project,
                    content = message("sqs.purge_queue.failed.60_seconds", selected.queueUrl)
                )
            } catch (e: Exception) {
                LOG.error(e) { "Exception thrown while trying to purge query ${selected.queueUrl}" }
                notifyError(
                    project = project,
                    content = message("sqs.purge_queue.failed", selected.queueUrl)
                )
            }
        }
    }

    private companion object {
        private val LOG = getLogger<PurgeQueueAction>()
    }
}
