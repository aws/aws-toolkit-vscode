// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.ide.util.PropertiesComponent
import com.intellij.ui.components.JBTextArea
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import java.awt.event.KeyEvent
import java.awt.event.KeyListener
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel

class SendMessagePane(
    private val client: SqsClient,
    private val queue: Queue,
    private val messageCache: PropertiesComponent
) : CoroutineScope by ApplicationThreadPoolScope("SendMessagePane") {
    lateinit var component: JPanel
    lateinit var inputText: JBTextArea
    lateinit var sendButton: JButton
    lateinit var clearButton: JButton
    lateinit var bodyErrorLabel: JLabel
    lateinit var confirmationLabel: JLabel
    lateinit var fifoFields: FifoPanel

    init {
        loadComponents()
        setButtons()
        setFields()
    }

    private fun loadComponents() {
        if (!queue.isFifo) {
            fifoFields.component.isVisible = false
        }
        bodyErrorLabel.isVisible = false
        confirmationLabel.isVisible = false
    }

    private fun setButtons() {
        sendButton.addActionListener {
            launch { sendMessage() }
        }
        clearButton.addActionListener {
            inputText.text = ""
            fifoFields.deduplicationId.text = ""
            fifoFields.groupId.text = ""
            messageCache.setValue(queue.queueUrl, "")
            confirmationLabel.isVisible = false
        }
    }

    private fun setFields() {
        inputText.apply {
            emptyText.text = message("sqs.send.message.body.empty.text")
            text = messageCache.getValue(queue.queueUrl)
            addKeyListener(object : KeyListener {
                override fun keyTyped(e: KeyEvent?) {
                    if (bodyErrorLabel.isVisible) {
                        bodyErrorLabel.isVisible = false
                    }
                }
                override fun keyPressed(e: KeyEvent?) {}
                override fun keyReleased(e: KeyEvent?) {}
            })
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
                messageCache.setValue(queue.queueUrl, inputText.text)
            } catch (e: Exception) {
                confirmationLabel.text = message("sqs.failed_to_send_message")
            }
            confirmationLabel.isVisible = true
        }
    }

    private fun validateFields(): Boolean {
        val inputIsValid = inputText.text.isNotEmpty()
        bodyErrorLabel.isVisible = !inputIsValid

        return if (queue.isFifo) {
            (fifoFields.validateFields() && inputIsValid)
        } else {
            inputIsValid
        }
    }
}
