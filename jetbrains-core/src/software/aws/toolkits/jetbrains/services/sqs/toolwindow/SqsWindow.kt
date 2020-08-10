// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import icons.AwsIcons
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowManager
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowType
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message

class SqsWindow(private val project: Project) : CoroutineScope by ApplicationThreadPoolScope("SqsWindow") {
    private val toolWindow = ToolkitToolWindowManager.getInstance(project, SQS_TOOL_WINDOW)
    private val edtContext = getCoroutineUiContext()
    private val client: SqsClient = project.awsClient()

    fun pollMessage(queue: Queue) {
        showQueue(queue, SqsWindowUI(project, client, queue).apply { pollMessage() })
    }

    fun sendMessage(queue: Queue) {
        showQueue(queue, SqsWindowUI(project, client, queue).apply { sendMessage() })
    }

    private fun showQueue(queue: Queue, component: SqsWindowUI) = launch {
        try {
            val existingWindow = toolWindow.find(queue.queueUrl)
            if (existingWindow != null) {
                withContext(edtContext) {
                    existingWindow.dispose()
                }
            }

            withContext(edtContext) {
                toolWindow.addTab(queue.queueName, component.mainPanel, activate = true, id = queue.queueUrl)
            }
        } catch (e: Exception) {
            LOG.error(e) { "Exception thrown while trying to open queue '${queue.queueName}'" }
            throw e
        }
    }

    fun closeQueue(queueUrl: String) = launch {
        withContext(edtContext) {
            toolWindow.find(queueUrl)?.dispose()
        }
    }

    companion object {
        internal val SQS_TOOL_WINDOW = ToolkitToolWindowType(
            "AWS.Sqs",
            message("sqs.toolwindow"),
            AwsIcons.Resources.Sqs.SQS_TOOL_WINDOW
        )

        fun getInstance(project: Project) = ServiceManager.getService(project, SqsWindow::class.java)
        private val LOG = getLogger<SqsWindow>()
    }
}
