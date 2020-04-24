// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.speedSearch.SpeedSearchSupply
import com.intellij.ui.speedSearch.SpeedSearchUtil
import com.intellij.util.text.DateFormatUtil
import com.intellij.util.text.SyncDateFormat
import com.intellij.util.ui.ColumnInfo
import com.intellij.util.ui.ListTableModel
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.jetbrains.utils.ui.drawSearchMatch
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.Shape
import java.text.SimpleDateFormat
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTable
import javax.swing.JTextArea
import javax.swing.SortOrder
import javax.swing.border.CompoundBorder
import javax.swing.border.EmptyBorder
import javax.swing.table.DefaultTableCellRenderer
import javax.swing.table.TableCellRenderer
import javax.swing.table.TableRowSorter
import javax.swing.text.Highlighter
import javax.swing.text.JTextComponent

class LogStreamsStreamColumn : ColumnInfo<LogStream, String>(message("cloudwatch.logs.log_streams")) {
    private val renderer = LogStreamsStreamColumnRenderer()
    override fun valueOf(item: LogStream?): String? = item?.logStreamName()

    override fun isCellEditable(item: LogStream?): Boolean = false
    override fun getRenderer(item: LogStream?): TableCellRenderer? = renderer
}

class LogStreamsStreamColumnRenderer() : TableCellRenderer {
    override fun getTableCellRendererComponent(table: JTable?, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int): Component {
        val component = SimpleColoredComponent()
        component.append((value as? String)?.trim() ?: "")
        if (table == null) {
            return component
        }
        component.setSelectionHighlighting(table, isSelected)
        SpeedSearchUtil.applySpeedSearchHighlighting(table, component, true, isSelected)

        return component
    }
}

class LogStreamsDateColumn : ColumnInfo<LogStream, String>(message("cloudwatch.logs.last_event_time")) {
    private val renderer = ResizingDateColumnRenderer(showSeconds = false)
    override fun valueOf(item: LogStream?): String? = item?.lastEventTimestamp()?.toString()

    override fun isCellEditable(item: LogStream?): Boolean = false
    override fun getRenderer(item: LogStream?): TableCellRenderer? = renderer
}

class LogGroupTableSorter(model: ListTableModel<LogStream>) : TableRowSorter<ListTableModel<LogStream>>(model) {
    init {
        sortKeys = listOf(SortKey(1, SortOrder.DESCENDING))
        setSortable(0, false)
        setSortable(1, false)
    }
}

class LogGroupFilterTableSorter(model: ListTableModel<LogStream>) : TableRowSorter<ListTableModel<LogStream>>(model) {
    init {
        sortKeys = listOf(SortKey(0, SortOrder.DESCENDING))
        setSortable(0, false)
        setSortable(1, false)
    }
}

class LogStreamDateColumn : ColumnInfo<LogStreamEntry, String>(message("general.time")) {
    private val renderer = ResizingDateColumnRenderer(showSeconds = true)
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

    override fun getTableCellRendererComponent(table: JTable?, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int): Component {
        val component = JBTextArea()
        if (table == null) {
            return component
        }

        component.wrapStyleWord = wrap
        component.lineWrap = wrap
        component.text = (value as? String)?.trim()
        component.font = font
        component.setSelectionHighlighting(table, isSelected)

        component.setSize(table.columnModel.getColumn(column).width, component.preferredSize.height)
        if (table.getRowHeight(row) != component.preferredSize.height) {
            table.setRowHeight(row, component.preferredSize.height)
        }

        component.speedSearchHighlighter(table)

        return component
    }
}

private class ResizingDateColumnRenderer(showSeconds: Boolean) : TableCellRenderer {
    private val defaultRenderer = DefaultTableCellRenderer()
    private val formatter: SyncDateFormat = if (showSeconds) {
        SyncDateFormat(SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS"))
    } else {
        DateFormatUtil.getDateTimeFormat()
    }

    override fun getTableCellRendererComponent(table: JTable?, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int): Component {
        // This wrapper will let us force the component to be at the top instead of in the middle for linewraps
        val wrapper = JPanel(BorderLayout())
        val defaultComponent = defaultRenderer.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)
        if (table == null) {
            return defaultComponent
        }
        val component = defaultComponent as? JLabel ?: return defaultComponent
        component.text = (value as? String)?.toLongOrNull()?.let {
            formatter.format(it)
        }
        if (component.preferredSize.width > table.columnModel.getColumn(column).preferredWidth) {
            // add 3 pixels of padding. No padding makes it go into ... mode cutting off the end
            table.columnModel.getColumn(column).preferredWidth = component.preferredSize.width + 3
            table.columnModel.getColumn(column).maxWidth = component.preferredSize.width + 3
        }
        wrapper.add(component, BorderLayout.NORTH)
        // Make sure the background matches for selection
        wrapper.background = component.background
        // if a component is selected, it puts a border on it, move the border to the wrapper instead
        if (isSelected) {
            // this border has an outside and inside border, take only the outside border
            wrapper.border = (component.border as? CompoundBorder)?.outsideBorder
            // Push the text up to compensate for the new border
            component.border = EmptyBorder(-1, 0, 0, 0)
        } else {
            component.border = null
        }
        return wrapper
    }
}

private fun Component.setSelectionHighlighting(table: JTable, isSelected: Boolean) {
    if (isSelected) {
        foreground = table.selectionForeground
        background = table.selectionBackground
    } else {
        foreground = table.foreground
        background = table.background
    }
}

private class SpeedSearchHighlighter : Highlighter.HighlightPainter {
    override fun paint(g: Graphics?, startingPoint: Int, endingPoint: Int, bounds: Shape?, component: JTextComponent?) {
        component ?: return
        val graphics = g as? Graphics2D ?: return
        val beginningRect = component.modelToView(startingPoint)
        val endingRect = component.modelToView(endingPoint)
        drawSearchMatch(graphics, beginningRect.x.toFloat(), endingRect.x.toFloat(), beginningRect.y.toFloat(), beginningRect.height)
    }
}

private fun JTextArea.speedSearchHighlighter(speedSearchEnabledComponent: JComponent) {
    // matchingFragments does work with wrapped text but not around words if they are wrapped, so it will also need to be extended
    // in the future
    val speedSearch = SpeedSearchSupply.getSupply(speedSearchEnabledComponent) ?: return
    val fragments = speedSearch.matchingFragments(text)?.iterator() ?: return
    fragments.forEach {
        highlighter?.addHighlight(it.startOffset, it.endOffset, SpeedSearchHighlighter())
    }
}
