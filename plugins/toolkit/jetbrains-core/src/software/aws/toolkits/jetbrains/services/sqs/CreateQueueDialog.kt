// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.sqs.resources.SqsResources
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SqsQueueType
import software.aws.toolkits.telemetry.SqsTelemetry
import javax.swing.JComponent

class CreateQueueDialog(
    private val project: Project,
    private val client: SqsClient
) : DialogWrapper(project) {
    private val coroutineScope = projectCoroutineScope(project)
    val view = CreateQueuePanel()

    init {
        title = message("sqs.create.queue.title")
        setOKButtonText(message("sqs.create.queue.create"))
        setOKButtonTooltip(message("sqs.create.queue.tooltip"))

        init()
    }

    override fun createCenterPanel(): JComponent? = view.component

    override fun getPreferredFocusedComponent(): JComponent? = view.queueName

    override fun doValidate(): ValidationInfo? = validateFields()

    override fun doCancelAction() {
        SqsTelemetry.createQueue(project, Result.Cancelled)
        super.doCancelAction()
    }

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }
        setOKButtonText(message("general.create_in_progress"))
        isOKActionEnabled = false

        coroutineScope.launch {
            try {
                createQueue()
                withContext(getCoroutineUiContext()) {
                    close(OK_EXIT_CODE)
                }
                project.refreshAwsTree(SqsResources.LIST_QUEUE_URLS)
                SqsTelemetry.createQueue(project, Result.Succeeded, if (view.fifoType.isSelected) SqsQueueType.Fifo else SqsQueueType.Standard)
            } catch (e: Exception) {
                // API only throws QueueNameExistsException if the request includes attributes whose values differ from those of the existing queue.
                LOG.warn(e) { message("sqs.create.queue.failed", queueName()) }
                setErrorText(e.message)
                setOKButtonText(message("sqs.create.queue.create"))
                isOKActionEnabled = true
                SqsTelemetry.createQueue(project, Result.Failed, if (view.fifoType.isSelected) SqsQueueType.Fifo else SqsQueueType.Standard)
            }
        }
    }

    private fun validateFields(): ValidationInfo? {
        if (view.queueName.text.isEmpty()) {
            return ValidationInfo(message("sqs.create.validation.empty.queue.name"), view.queueName)
        }
        if (queueName().length > MAX_LENGTH_OF_QUEUE_NAME) {
            return ValidationInfo(message("sqs.create.validation.long.queue.name", MAX_LENGTH_OF_QUEUE_NAME), view.queueName)
        }
        if (!validateCharacters(view.queueName.text)) {
            return ValidationInfo(message("sqs.create.validation.queue.name.invalid"), view.queueName)
        }

        return null
    }

    private fun validateCharacters(queueName: String): Boolean = queueName.matches("^[a-zA-Z0-9-_]*$".toRegex())

    private fun queueName(): String {
        val name = view.queueName.text.trim()
        return if (view.fifoType.isSelected) {
            name + FIFO_SUFFIX
        } else {
            name
        }
    }

    fun createQueue() {
        client.createQueue {
            it.queueName(queueName())
            if (view.fifoType.isSelected) {
                it.attributes(mutableMapOf(Pair(QueueAttributeName.FIFO_QUEUE, true.toString())))
            }
        }
    }

    private companion object {
        val LOG = getLogger<CreateQueueDialog>()
        const val FIFO_SUFFIX = ".fifo"
    }
}
