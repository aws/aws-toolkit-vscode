// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.ide.HelpTooltip
import com.intellij.ui.components.JBTextField
import software.aws.toolkits.jetbrains.services.sqs.MAX_LENGTH_OF_FIFO_ID
import software.aws.toolkits.resources.message
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

class FifoPanel {
    lateinit var component: JPanel
    lateinit var deduplicationId: JBTextField
    lateinit var groupId: JBTextField
    lateinit var deduplicationErrorLabel: JLabel
    lateinit var groupErrorLabel: JLabel
    lateinit var deduplicationContextHelp: JLabel
    lateinit var groupContextHelp: JLabel

    init {
        loadComponents()
        setFields()
    }

    private fun loadComponents() {
        deduplicationErrorLabel.isVisible = false
        groupErrorLabel.isVisible = false

        deduplicationContextHelp.icon = AllIcons.General.ContextHelp
        HelpTooltip().apply {
            setDescription(message("sqs.message.deduplication_id.tooltip"))
            installOn(deduplicationContextHelp)
        }
        groupContextHelp.icon = AllIcons.General.ContextHelp
        HelpTooltip().apply {
            setDescription(message("sqs.message.group_id.tooltip"))
            installOn(groupContextHelp)
        }
    }

    private fun setFields() {
        deduplicationId.apply {
            emptyText.text = message("sqs.required.empty.text")
            document.addDocumentListener(createListener(this, deduplicationErrorLabel))
        }

        groupId.apply {
            emptyText.text = message("sqs.required.empty.text")
            document.addDocumentListener(createListener(this, groupErrorLabel))
        }
    }

    fun validateFields(): Boolean {
        var deduplicationIsValid = true
        var groupIsValid = true

        if (deduplicationId.text.length > MAX_LENGTH_OF_FIFO_ID) {
            deduplicationErrorLabel.text = message("sqs.message.validation.long.id")
            deduplicationErrorLabel.isVisible = true
            deduplicationIsValid = false
        } else if (deduplicationId.text.isEmpty()) {
            deduplicationErrorLabel.text = message("sqs.message.validation.empty.deduplication_id")
            deduplicationErrorLabel.isVisible = true
            deduplicationIsValid = false
        }

        if (groupId.text.length > MAX_LENGTH_OF_FIFO_ID) {
            groupErrorLabel.text = message("sqs.message.validation.long.id")
            groupErrorLabel.isVisible = true
            groupIsValid = false
        } else if (groupId.text.isEmpty()) {
            groupErrorLabel.text = message("sqs.message.validation.empty.group_id")
            groupErrorLabel.isVisible = true
            groupIsValid = false
        }

        return (deduplicationIsValid && groupIsValid)
    }

    private fun createListener(textField: JBTextField, errorLabel: JLabel): DocumentListener = object : DocumentListener {
        override fun changedUpdate(e: DocumentEvent?) {}
        override fun insertUpdate(e: DocumentEvent?) {
            if (textField.text.length > MAX_LENGTH_OF_FIFO_ID) {
                errorLabel.text = message("sqs.message.validation.long.id")
                errorLabel.isVisible = true
            } else {
                errorLabel.isVisible = false
            }
        }
        override fun removeUpdate(e: DocumentEvent?) {
            if (textField.text.length <= MAX_LENGTH_OF_FIFO_ID) {
                errorLabel.isVisible = false
            }
        }
    }
}
