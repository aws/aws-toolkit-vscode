// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentManager
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.jetbrains.services.sqs.telemetryType
import software.aws.toolkits.telemetry.SqsTelemetry

class SqsWindow(private val project: Project) {
    private val client: SqsClient = project.awsClient()

    fun pollMessage(queue: Queue) {
        showQueue(queue).pollMessage()
    }

    fun sendMessage(queue: Queue) {
        showQueue(queue).sendMessage()
    }

    private fun showQueue(queue: Queue): SqsWindowUi {
        ApplicationManager.getApplication().assertIsDispatchThread()

        SqsTelemetry.openQueue(project, queue.telemetryType())

        val toolWindow = SqsWindowFactory.getToolWindow(project)
        val contentManager = toolWindow.contentManager

        val sqsViewContent = findQueue(queue.queueUrl) ?: createSqsView(contentManager, queue)

        toolWindow.show()
        contentManager.setSelectedContent(sqsViewContent, true)

        return sqsViewContent.component as SqsWindowUi
    }

    fun findQueue(queueUrl: String): Content? {
        ApplicationManager.getApplication().assertIsDispatchThread()

        val toolWindow = SqsWindowFactory.getToolWindow(project)
        val contentManager = toolWindow.contentManager

        return contentManager.contents.find {
            val component = it.component
            component is SqsWindowUi && component.queue.queueUrl == queueUrl
        }
    }

    private fun createSqsView(contentManager: ContentManager, queue: Queue): Content {
        val sqsView = SqsWindowUi(project, client, queue)
        val sqsViewContent = contentManager.factory.createContent(sqsView.component, queue.queueName, false)
        sqsViewContent.isCloseable = true
        sqsViewContent.isPinnable = true
        contentManager.addContent(sqsViewContent)

        return sqsViewContent
    }

    fun closeQueue(queueUrl: String) {
        ApplicationManager.getApplication().assertIsDispatchThread()

        findQueue(queueUrl)?.let {
            SqsWindowFactory.getToolWindow(project).contentManager.removeContent(it, true)
        }
    }

    companion object {
        fun getInstance(project: Project): SqsWindow = project.service()
    }
}
