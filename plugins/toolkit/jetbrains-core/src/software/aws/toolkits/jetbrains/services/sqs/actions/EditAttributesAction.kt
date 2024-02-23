// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.PerformInBackgroundOption
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.DumbAware
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.amazon.awssdk.services.sqs.model.SqsException
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.sqs.EditAttributesDialog
import software.aws.toolkits.jetbrains.services.sqs.SqsQueueNode
import software.aws.toolkits.jetbrains.services.sqs.telemetryType
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SqsTelemetry

class EditAttributesAction : SingleResourceNodeAction<SqsQueueNode>(message("sqs.edit.attributes.action")), DumbAware {
    override fun actionPerformed(selected: SqsQueueNode, e: AnActionEvent) {
        ProgressManager.getInstance().run(
            object : Task.Backgroundable(
                selected.project,
                message("sqs.edit.attributes.retrieving_from_service"),
                false,
                PerformInBackgroundOption.ALWAYS_BACKGROUND
            ) {
                override fun run(indicator: ProgressIndicator) {
                    val client = selected.nodeProject.awsClient<SqsClient>()
                    val queue = selected.queue
                    val attributes = try {
                        client.getQueueAttributes {
                            it.queueUrl(queue.queueUrl)
                            it.attributeNames(QueueAttributeName.ALL)
                        }.attributes()
                    } catch (e: SqsException) {
                        LOG.error(e) { "Getting queue parameters failed" }
                        notifyError(
                            project = project,
                            title = message("sqs.service_name"),
                            content = message("sqs.edit.attributes.failed", queue.queueName)
                        )
                        SqsTelemetry.editQueueParameters(project, Result.Failed, queue.telemetryType())
                        return
                    }
                    runInEdt {
                        EditAttributesDialog(selected.nodeProject, client, queue, attributes).show()
                    }
                }
            }
        )
    }

    private companion object {
        val LOG = getLogger<EditAttributesAction>()
    }
}
