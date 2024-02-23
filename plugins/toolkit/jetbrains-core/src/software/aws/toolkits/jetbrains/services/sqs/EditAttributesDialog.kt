// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.amazon.awssdk.services.sqs.model.SqsException
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SqsTelemetry
import javax.swing.JComponent

class EditAttributesDialog(
    private val project: Project,
    private val client: SqsClient,
    private val queue: Queue,
    private val attributes: Map<QueueAttributeName, String>
) : DialogWrapper(project) {
    private val coroutineScope = projectCoroutineScope(project)
    val view = EditAttributesPanel()

    init {
        title = message("sqs.edit.attributes")
        setOKButtonText(message("sqs.edit.attributes.save"))
        populateFields()
        init()
    }

    override fun createCenterPanel(): JComponent? = view.component

    override fun doValidate(): ValidationInfo? {
        val sliderIssue = view.visibilityTimeout.validate() ?: view.deliveryDelay.validate() ?: view.waitTime.validate()
        if (sliderIssue != null) {
            return sliderIssue
        }
        return try {
            view.retentionPeriod.validateContent()
            view.messageSize.validateContent()
            null
        } catch (e: ConfigurationException) {
            ValidationInfo(e.title)
        }
    }

    override fun doCancelAction() {
        SqsTelemetry.editQueueParameters(project, Result.Cancelled, queue.telemetryType())
        super.doCancelAction()
    }

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }
        isOKActionEnabled = false
        coroutineScope.launch {
            try {
                updateAttributes()
                notifyInfo(
                    project = project,
                    title = message("sqs.service_name"),
                    content = message("sqs.edit.attributes.updated", queue.queueName)
                )
                SqsTelemetry.editQueueParameters(project, Result.Succeeded, queue.telemetryType())
                withContext(getCoroutineUiContext()) {
                    close(OK_EXIT_CODE)
                }
            } catch (e: SqsException) {
                LOG.error(e) { "Updating queue parameters failed" }
                setErrorText(e.message)
                isOKActionEnabled = true
                SqsTelemetry.editQueueParameters(project, Result.Failed, queue.telemetryType())
            }
        }
    }

    private fun populateFields() {
        view.visibilityTimeout.value = attributes[QueueAttributeName.VISIBILITY_TIMEOUT]?.toIntOrNull() ?: MIN_VISIBILITY_TIMEOUT
        view.messageSize.text = attributes[QueueAttributeName.MAXIMUM_MESSAGE_SIZE]
        view.retentionPeriod.text = attributes[QueueAttributeName.MESSAGE_RETENTION_PERIOD]
        view.deliveryDelay.value = attributes[QueueAttributeName.DELAY_SECONDS]?.toIntOrNull() ?: MIN_DELIVERY_DELAY
        view.waitTime.value = attributes[QueueAttributeName.RECEIVE_MESSAGE_WAIT_TIME_SECONDS]?.toIntOrNull() ?: MIN_WAIT_TIME
    }

    internal fun updateAttributes() {
        client.setQueueAttributes {
            it.queueUrl(queue.queueUrl)
            it.attributes(
                mutableMapOf(
                    QueueAttributeName.VISIBILITY_TIMEOUT to view.visibilityTimeout.value.toString(),
                    QueueAttributeName.MAXIMUM_MESSAGE_SIZE to view.messageSize.text,
                    QueueAttributeName.MESSAGE_RETENTION_PERIOD to view.retentionPeriod.text,
                    QueueAttributeName.DELAY_SECONDS to view.deliveryDelay.value.toString(),
                    QueueAttributeName.RECEIVE_MESSAGE_WAIT_TIME_SECONDS to view.waitTime.value.toString()
                )
            )
        }
    }

    private companion object {
        val LOG = getLogger<EditAttributesDialog>()
    }
}
