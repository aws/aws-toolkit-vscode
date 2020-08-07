// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TableSpeedSearch
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import software.amazon.awssdk.services.sqs.model.Message
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JTable

class MessagesTable {
    val component: JComponent
    val table: TableView<Message>
    val tableModel = ListTableModel<Message>(
        arrayOf(
            MessageIdColumn(),
            MessageBodyColumn(),
            MessageSenderIdColumn(),
            MessageDateColumn()
        ), mutableListOf<Message>()
    )

    init {
        table = TableView(tableModel).apply {
            autoscrolls = true
            tableHeader.reorderingAllowed = false
            tableHeader.resizingAllowed = false
            autoResizeMode = JTable.AUTO_RESIZE_LAST_COLUMN
            setPaintBusy(true)
            emptyText.text = message("loading_resource.loading")
        }

        TableSpeedSearch(table)
        component = ScrollPaneFactory.createScrollPane(table)
    }

    fun reset() {
        while (tableModel.rowCount != 0) {
            tableModel.removeRow(0)
        }
    }

    fun setBusy(busy: Boolean) {
        table.setPaintBusy(busy)
        if (busy) {
            table.emptyText.text = message("loading_resource.loading")
        } else {
            table.emptyText.text = message("sqs.message.no_messages")
        }
    }
}
