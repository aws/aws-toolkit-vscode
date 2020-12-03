// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.ide.HelpTooltip
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.components.JBTextField
import software.aws.toolkits.jetbrains.services.sqs.MAX_LENGTH_OF_FIFO_ID
import software.aws.toolkits.resources.message
import java.util.UUID
import javax.swing.JLabel
import javax.swing.JPanel

class FifoPanel {
    lateinit var component: JPanel
        private set
    lateinit var deduplicationId: JBTextField
        private set
    lateinit var groupId: JBTextField
        private set
    lateinit var deduplicationContextHelp: JLabel
        private set
    lateinit var groupContextHelp: JLabel
        private set

    init {
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
        deduplicationId.emptyText.text = message("sqs.required.empty.text")
        groupId.emptyText.text = message("sqs.required.empty.text")
        clear()
    }

    fun validateFields(): List<ValidationInfo> = listOfNotNull(
        validateDedupeId(),
        validateGroupId()
    )

    fun clear(isSend: Boolean = false) {
        deduplicationId.text = UUID.randomUUID().toString()
        if (!isSend) {
            groupId.text = ""
        }
    }

    private fun validateDedupeId(): ValidationInfo? = when {
        deduplicationId.text.length > MAX_LENGTH_OF_FIFO_ID -> {
            ValidationInfo(message("sqs.message.validation.long.id"), deduplicationId)
        }
        deduplicationId.text.isBlank() -> {
            ValidationInfo(message("sqs.message.validation.empty.deduplication_id"), deduplicationId)
        }
        else -> {
            null
        }
    }

    private fun validateGroupId(): ValidationInfo? = when {
        groupId.text.length > MAX_LENGTH_OF_FIFO_ID -> {
            ValidationInfo(message("sqs.message.validation.long.id"), groupId)
        }
        groupId.text.isBlank() -> {
            ValidationInfo(message("sqs.message.validation.empty.group_id"), groupId)
        }
        else -> {
            null
        }
    }
}
