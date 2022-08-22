// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.speedSearch.SpeedSearchUtil
import com.intellij.util.text.DateFormatUtil
import com.intellij.util.text.SyncDateFormat
import com.intellij.util.ui.ColumnInfo
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.jetbrains.utils.ui.ResizingTextColumnRenderer
import software.aws.toolkits.jetbrains.utils.ui.WrappingCellRenderer
import software.aws.toolkits.jetbrains.utils.ui.setSelectionHighlighting
import software.aws.toolkits.resources.message
import java.awt.Component
import java.text.SimpleDateFormat
import javax.swing.JTable
import javax.swing.table.TableCellRenderer

class LogStreamsStreamColumn(private val sortable: Boolean) : ColumnInfo<LogStream, String>(message("cloudwatch.logs.log_streams")) {
    private val renderer = LogStreamsStreamColumnRenderer()
    override fun valueOf(item: LogStream?): String? = item?.logStreamName()
    override fun isCellEditable(item: LogStream?): Boolean = false
    override fun getRenderer(item: LogStream?): TableCellRenderer = renderer
    override fun getComparator(): Comparator<LogStream>? = if (sortable) Comparator.comparing { it.logStreamName() } else null
}

class LogStreamsStreamColumnRenderer : TableCellRenderer {
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

class LogStreamsDateColumn(
    private val sortable: Boolean,
    val format: SyncDateFormat? = null
) : ColumnInfo<LogStream, String>(message("cloudwatch.logs.last_event_time")) {
    private val renderer = ResizingTextColumnRenderer()
    override fun valueOf(item: LogStream?): String? = TimeFormatConversion.convertEpochTimeToStringDateTime(
        item?.lastEventTimestamp(),
        showSeconds = false,
        format = format
    )

    override fun isCellEditable(item: LogStream?): Boolean = false
    override fun getRenderer(item: LogStream?): TableCellRenderer = renderer
    override fun getComparator(): Comparator<LogStream>? = if (sortable) Comparator.comparing { it.lastEventTimestamp() ?: Long.MIN_VALUE } else null
}

class LogStreamDateColumn(private val format: SyncDateFormat? = null) : ColumnInfo<LogStreamEntry, String>(message("general.time")) {
    private val renderer = ResizingTextColumnRenderer()
    override fun valueOf(item: LogStreamEntry?): String? = TimeFormatConversion.convertEpochTimeToStringDateTime(
        item?.timestamp,
        showSeconds = true,
        format = format
    )

    override fun isCellEditable(item: LogStreamEntry?): Boolean = false
    override fun getRenderer(item: LogStreamEntry?): TableCellRenderer = renderer
}

class LogStreamMessageColumn : ColumnInfo<LogStreamEntry, String>(message("general.message")) {
    private val renderer = WrappingCellRenderer(wrapOnSelection = true, wrapOnToggle = true)
    fun wrap() {
        renderer.wrap = true
    }

    fun unwrap() {
        renderer.wrap = false
    }

    override fun valueOf(item: LogStreamEntry?): String? = item?.message
    override fun isCellEditable(item: LogStreamEntry?): Boolean = false
    override fun getRenderer(item: LogStreamEntry?): TableCellRenderer = renderer
}

object TimeFormatConversion {
    fun convertEpochTimeToStringDateTime(epochTime: Long?, showSeconds: Boolean, format: SyncDateFormat? = null): String? {
        val formatter = format ?: if (showSeconds) {
            SyncDateFormat(SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS"))
        } else {
            DateFormatUtil.getDateTimeFormat()
        }
        return epochTime?.let { formatter.format(it) }
    }
}
