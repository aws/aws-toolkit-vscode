// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.ui.SimpleColoredComponent
import com.intellij.util.ui.ColumnInfo
import software.aws.toolkits.jetbrains.utils.ui.ResizingTextColumnRenderer
import software.aws.toolkits.jetbrains.utils.ui.setSelectionHighlighting
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JTable
import javax.swing.table.TableCellRenderer

class LogResultColumnInfo(private val fieldName: String) : ColumnInfo<LogResult, String>(fieldName) {
    override fun valueOf(item: Map<String, String>?): String? {
        if (item != null) {
            return item[fieldName]
        }
        return null
    }

    override fun isCellEditable(item: Map<String, String>?): Boolean = false
    override fun getRenderer(item: Map<String, String>?) = LogResultColumnRenderer()
}

class LogResultColumnRenderer : TableCellRenderer {
    override fun getTableCellRendererComponent(table: JTable?, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int): Component {
        val component = SimpleColoredComponent()
        component.append((value as? String)?.trim() ?: "")
        if (table == null) {
            return component
        }
        component.setSelectionHighlighting(table, isSelected)
        return component
    }
}

class LogRecordFieldColumn : ColumnInfo<LogRecordFieldPair, String>(message("cloudwatch.logs.log_record_field")) {
    override fun getRenderer(item: LogRecordFieldPair?) = ResizingTextColumnRenderer()
    override fun valueOf(item: LogRecordFieldPair?) = item?.first
}

class LogRecordValueColumn : ColumnInfo<LogRecordFieldPair, String>(message("cloudwatch.logs.log_record_value")) {
    override fun valueOf(item: LogRecordFieldPair?) = item?.second
}
