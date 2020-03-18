// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.ui.components.JBTextArea
import com.intellij.util.text.DateFormatUtil
import com.intellij.util.ui.ColumnInfo
import com.intellij.util.ui.ListTableModel
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JTable
import javax.swing.SortOrder
import javax.swing.table.TableCellRenderer
import javax.swing.table.TableRowSorter

class LogStreamsStreamColumn : ColumnInfo<LogStream, String>(message("cloudwatch.logs.log_streams")) {
    override fun valueOf(item: LogStream?): String? = item?.logStreamName()

    override fun isCellEditable(item: LogStream?): Boolean = false
}

class LogStreamsDateColumn : ColumnInfo<LogStream, String>(message("cloudwatch.logs.last_event_time")) {
    override fun valueOf(item: LogStream?): String? {
        val timestamp = item?.lastEventTimestamp() ?: return null
        return DateFormatUtil.getDateTimeFormat().format(timestamp)
    }

    override fun isCellEditable(item: LogStream?): Boolean = false
}

class LogGroupTableSorter(model: ListTableModel<LogStream>) : TableRowSorter<ListTableModel<LogStream>>(model) {
    init {
        sortKeys = listOf(SortKey(1, SortOrder.UNSORTED))
        setSortable(0, false)
        setSortable(1, false)
    }
}

class LogStreamDateColumn : ColumnInfo<OutputLogEvent, String>(message("general.time")) {
    override fun valueOf(item: OutputLogEvent?): String? {
        val timestamp = item?.timestamp() ?: return null
        return DateFormatUtil.getDateTimeFormat().format(timestamp)
    }

    override fun isCellEditable(item: OutputLogEvent?): Boolean = false
}

class LogStreamMessageColumn : ColumnInfo<OutputLogEvent, String>(message("general.message")) {
    override fun valueOf(item: OutputLogEvent?): String? = item?.message()
    override fun isCellEditable(item: OutputLogEvent?): Boolean = false
}

class WrappingLogStreamMessageColumn : ColumnInfo<OutputLogEvent, String>(message("general.message")) {
    private val renderer = WrappingLogStreamMessageRenderer()
    override fun valueOf(item: OutputLogEvent?): String? = item?.message()
    override fun isCellEditable(item: OutputLogEvent?): Boolean = false
    override fun getRenderer(item: OutputLogEvent?): TableCellRenderer? = renderer
}

private class WrappingLogStreamMessageRenderer : TableCellRenderer {
    override fun getTableCellRendererComponent(table: JTable, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int): Component {
        val component = JBTextArea()
        component.wrapStyleWord = true
        component.lineWrap = true
        component.text = (value as? String)?.trim()
        component.setSize(table.columnModel.getColumn(column).width, component.preferredSize.height)
        if (table.getRowHeight(row) != component.preferredSize.height) {
            table.setRowHeight(row, component.preferredSize.height)
        }
        return component
    }
}
