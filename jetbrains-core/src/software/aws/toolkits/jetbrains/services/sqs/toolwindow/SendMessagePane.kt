// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.ide.plugins.newui.UpdateButton
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.ui.ComponentValidator
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.components.JBTextArea
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollPane

class SendMessagePane(
    private val client: SqsClient,
    private val queue: Queue
) : CoroutineScope by ApplicationThreadPoolScope("SendMessagePane") {
    lateinit var component: JPanel
    lateinit var inputText: JBTextArea
    lateinit var sendButton: UpdateButton
    lateinit var clearButton: JButton
    lateinit var confirmationLabel: JLabel
    lateinit var fifoFields: FifoPanel
    lateinit var scrollPane: JScrollPane

    init {
        loadComponents()
        setButtons()
        setFields()
    }

    private fun loadComponents() {
        if (!queue.isFifo) {
            fifoFields.component.isVisible = false
        }
        confirmationLabel.isVisible = false
    }

    private fun setButtons() {
        sendButton.addActionListener {
            launch { sendMessage() }
        }
        clearButton.addActionListener {
            clearFields()
            confirmationLabel.isVisible = false
        }
    }

    private fun setFields() {
        scrollPane.apply {
            border = IdeBorderFactory.createBorder()
        }
        inputText.apply {
            emptyText.text = message("sqs.send.message.body.empty.text")
        }
    }

    suspend fun sendMessage() {
        if (validateFields()) {
            try {
                withContext(Dispatchers.IO) {
                    val messageId = client.sendMessage {
                        it.queueUrl(queue.queueUrl)
                        it.messageBody(inputText.text)
                        if (queue.isFifo) {
                            it.messageDeduplicationId(fifoFields.deduplicationId.text)
                            it.messageGroupId(fifoFields.groupId.text)
                        }
                    }.messageId()
                    confirmationLabel.text = message("sqs.send.message.success", messageId)
                }
                clearFields()
            } catch (e: Exception) {
                confirmationLabel.text = message("sqs.failed_to_send_message")
            }
            confirmationLabel.isVisible = true
        }
    }

    fun validateFields(): Boolean {
        val validationIssues = mutableListOf<ValidationInfo>().apply {
            if (inputText.text.isEmpty()) {
                add(ValidationInfo(message("sqs.message.validation.empty.message.body"), inputText))
            }
            if (queue.isFifo) {
                addAll(fifoFields.validateFields())
            }
        }
        return if (validationIssues.isEmpty()) {
            true
        } else {
            runInEdt(ModalityState.any()) {
                validationIssues.forEach { validationIssue ->
                    validationIssue.component?.let { component ->
                        ComponentValidator.createPopupBuilder(validationIssue, null)
                            .setCancelOnClickOutside(true)
                            .createPopup()
                            .showUnderneathOf(component)
                    }
                }
            }
            false
        }
    }

    private fun clearFields() {
        inputText.text = ""
        if (queue.isFifo) {
            fifoFields.deduplicationId.text = ""
            fifoFields.groupId.text = ""
        }
    }
}
