// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextArea
import com.intellij.util.text.DateFormatUtil
import com.intellij.util.ui.ColumnInfo
import com.intellij.util.ui.ListTableModel
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTable
import javax.swing.SortOrder
import javax.swing.table.DefaultTableCellRenderer
import javax.swing.table.TableCellRenderer
import javax.swing.table.TableRowSorter

class LogStreamsStreamColumn : ColumnInfo<LogStream, String>(message("cloudwatch.logs.log_streams")) {
    override fun valueOf(item: LogStream?): String? = item?.logStreamName()

    override fun isCellEditable(item: LogStream?): Boolean = false
}

class LogStreamsDateColumn : ColumnInfo<LogStream, String>(message("cloudwatch.logs.last_event_time")) {
    private val renderer = ResizingDateColumnRenderer()
    override fun valueOf(item: LogStream?): String? = item?.lastEventTimestamp()?.toString()

    override fun isCellEditable(item: LogStream?): Boolean = false
    override fun getRenderer(item: LogStream?): TableCellRenderer? = renderer
}

class LogGroupTableSorter(model: ListTableModel<LogStream>) : TableRowSorter<ListTableModel<LogStream>>(model) {
    init {
        sortKeys = listOf(SortKey(1, SortOrder.DESCENDING))
        setSortable(0, false)
        setSortable(1, true)
    }
}

class LogStreamDateColumn : ColumnInfo<LogStreamEntry, String>(message("general.time")) {
    private val renderer = ResizingDateColumnRenderer()
    override fun valueOf(item: LogStreamEntry?): String? = item?.timestamp?.toString()

    override fun isCellEditable(item: LogStreamEntry?): Boolean = false
    override fun getRenderer(item: LogStreamEntry?): TableCellRenderer? = renderer
}

class LogStreamMessageColumn : ColumnInfo<LogStreamEntry, String>(message("general.message")) {
    private val renderer = WrappingLogStreamMessageRenderer()
    fun wrap() {
        renderer.wrap = true
    }

    fun unwrap() {
        renderer.wrap = false
    }

    override fun valueOf(item: LogStreamEntry?): String? = item?.message
    override fun isCellEditable(item: LogStreamEntry?): Boolean = false
    override fun getRenderer(item: LogStreamEntry?): TableCellRenderer? = renderer
}

private class WrappingLogStreamMessageRenderer : TableCellRenderer {
    var wrap = false
    // JBTextArea has a different font from JBLabel (the default in a table) so harvest the font off of it
    private val font = JBLabel().font

    override fun getTableCellRendererComponent(table: JTable, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int): Component {
        val component = JBTextArea()

        if (isSelected) {
            component.foreground = table.selectionForeground
            component.background = table.selectionBackground
        } else {
            component.foreground = table.foreground
            component.background = table.background
        }

        component.wrapStyleWord = wrap
        component.lineWrap = wrap
        component.text = (value as? String)?.trim()
        component.font = font

        component.setSize(table.columnModel.getColumn(column).width, component.preferredSize.height)
        if (table.getRowHeight(row) != component.preferredSize.height) {
            table.setRowHeight(row, component.preferredSize.height)
        }
        return component
    }
}

private class ResizingDateColumnRenderer : TableCellRenderer {
    private val defaultRenderer = DefaultTableCellRenderer()
    override fun getTableCellRendererComponent(table: JTable, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int): Component {
        // This wrapper will let us force the component to be at the top instead of in the middle for linewraps
        val wrapper = JPanel(BorderLayout())
        val defaultComponent = defaultRenderer.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)
        val component = defaultComponent as? JLabel ?: return defaultComponent
        component.text = (value as? String)?.toLongOrNull()?.let {
            DateFormatUtil.getDateTimeFormat().format(it)
        }
        if (component.preferredSize.width > table.columnModel.getColumn(column).preferredWidth) {
            // add 20 pixels of padding
            table.columnModel.getColumn(column).preferredWidth = component.preferredSize.width + 20
            table.columnModel.getColumn(column).maxWidth = component.preferredSize.width + 20
        }
        wrapper.add(component, BorderLayout.NORTH)
        // Make sure the background matches for selection
        wrapper.background = component.background
        return wrapper
    }
}
