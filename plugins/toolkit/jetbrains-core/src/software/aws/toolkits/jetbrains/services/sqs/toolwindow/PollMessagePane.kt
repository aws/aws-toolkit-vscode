// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.ide.HelpTooltip
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.ui.PopupHandler
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.Message
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.sqs.MAX_NUMBER_OF_POLLED_MESSAGES
import software.aws.toolkits.jetbrains.services.sqs.Queue
import software.aws.toolkits.jetbrains.services.sqs.actions.CopyMessageAction
import software.aws.toolkits.jetbrains.services.sqs.actions.PurgeQueueAction
import software.aws.toolkits.jetbrains.services.sqs.approximateNumberOfMessages
import software.aws.toolkits.resources.message
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel

class PollMessagePane(
    private val project: Project,
    private val client: SqsClient,
    private val queue: Queue
) {
    private val coroutineScope = projectCoroutineScope(project)
    private val bgContext = getCoroutineBgContext()

    lateinit var component: JPanel
        private set
    lateinit var messagesAvailableLabel: JLabel
        private set
    lateinit var tablePanel: SimpleToolWindowPanel
        private set
    lateinit var pollButton: JButton
        private set
    lateinit var pollHelpLabel: JLabel
        private set

    val messagesTable = MessagesTable()

    private fun createUIComponents() {
        tablePanel = SimpleToolWindowPanel(false, true)
    }

    init {
        tablePanel.setContent(messagesTable.component)
        pollButton.addActionListener {
            poll()
        }
        pollHelpLabel.icon = AllIcons.General.ContextHelp
        HelpTooltip().apply {
            setDescription(message("sqs.poll.warning.text"))
            installOn(pollHelpLabel)
        }
        coroutineScope.launch {
            getAvailableMessages()
        }
        addActionsToTable()
    }

    suspend fun requestMessages() {
        try {
            withContext(bgContext) {
                val polledMessages: List<Message> = client.receiveMessage {
                    it.queueUrl(queue.queueUrl)
                    it.attributeNames(QueueAttributeName.ALL)
                    it.maxNumberOfMessages(MAX_NUMBER_OF_POLLED_MESSAGES)
                    // Make poll a real peek by setting the visibility timout to 0, so messages can be
                    // requested by other consumers of the queue immediately
                    it.visibilityTimeout(0)
                }.messages().distinctBy { it.messageId() }

                messagesTable.tableModel.addRows(polledMessages)

                messagesTable.table.emptyText.text = message("sqs.message.no_messages")
            }
        } catch (e: Exception) {
            messagesTable.table.emptyText.text = message("sqs.failed_to_poll_messages")
        } finally {
            messagesTable.setBusy(busy = false)
        }
    }

    suspend fun getAvailableMessages() {
        try {
            withContext(bgContext) {
                val numMessages = client.approximateNumberOfMessages(queue.queueUrl)
                messagesAvailableLabel.text = message("sqs.messages.available.text", numMessages ?: 0)
            }
        } catch (e: Exception) {
            messagesAvailableLabel.text = message("sqs.failed_to_load_total")
        }
    }

    private fun addActionsToTable() {
        val actionGroup = DefaultActionGroup().apply {
            add(CopyMessageAction(messagesTable.table).apply { registerCustomShortcutSet(CommonShortcuts.getCopy(), component) })
            add(Separator.create())
            add(PurgeQueueAction(project, client, queue))
        }
        PopupHandler.installPopupHandler(
            messagesTable.table,
            actionGroup,
            ActionPlaces.EDITOR_POPUP,
            ActionManager.getInstance()
        )
    }

    private fun poll() = coroutineScope.launch {
        // TODO: Add debounce
        messagesTable.setBusy(busy = true)
        messagesTable.reset()
        requestMessages()
        getAvailableMessages()
    }
}
