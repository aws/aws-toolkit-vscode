// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.openapi.Disposable
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import software.amazon.awssdk.services.cloudformation.model.StackEvent
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JTable
import javax.swing.SwingUtilities
import javax.swing.table.DefaultTableCellRenderer
import javax.swing.table.DefaultTableModel

/**
 * Events table
 */
interface TableView : View {
    /**
     * [events] List<StackEvent> Events in reverse chronological order.
     * All events are inserted in the top of the table.
     * Also, resets "Loading" icon (see [showBusyIcon]) and inserts [events] to the top of the table.
     * If [pageChanged] current events are removed
     */
    fun insertEvents(events: List<StackEvent>, pageChanged: Boolean)

    /**
     * Show "Loading" icon. Will be reset after [insertEvents]
     */
    fun showBusyIcon()
}

private enum class Fields(val readableName: String, val getData: (StackEvent) -> Any) {
    TIME(message("cloudformation.stack.time"), { e -> e.timestamp() }),
    // CFN Resource Status does not match what we expect (StackStatus enum)
    STATUS(message("cloudformation.stack.status"), { e -> e.resourceStatusAsString() }),
    TYPE(message("cloudformation.stack.type"), { e -> e.resourceType() }),
    LOGICAL_ID(message("cloudformation.stack.logical_id"), { e -> e.logicalResourceId() }),
    PHYSICAL_ID(message("cloudformation.stack.physical_id"), { e -> e.physicalResourceId() + e }),
    REASON(message("cloudformation.stack.reason"), { e -> e.resourceStatusReason() ?: "" });

    override fun toString() = readableName
}

private class StatusCellRenderer : DefaultTableCellRenderer() {
    override fun getTableCellRendererComponent(table: JTable, value: Any, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int) =
        super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column).also {
            it.foreground = StatusType.fromStatusValue(value as String).color
        }
}

private class StackTableModel : DefaultTableModel(Fields.values().map(Fields::readableName).toTypedArray(), 0) {
    override fun isCellEditable(row: Int, column: Int) = false
}

internal class TableViewImpl : TableView, Disposable {

    private val model = StackTableModel()
    private val table = JBTable(model).apply {
        autoCreateRowSorter = true
        autoscrolls = true
        setShowColumns(true)
        setPaintBusy(true)
        getColumn(Fields.STATUS.readableName).cellRenderer = StatusCellRenderer()
    }
    override val component: JComponent = JBScrollPane(table)

    override fun showBusyIcon() {
        table.setPaintBusy(true)
    }

    override fun insertEvents(events: List<StackEvent>, pageChanged: Boolean) {
        assert(SwingUtilities.isEventDispatchThread())
        if (pageChanged) {
            model.rowCount = 0
        }
        for (event in events.reversed()) {
            model.insertRow(0, Fields.values().map { it.getData(event) }.toTypedArray())
        }
        table.setPaintBusy(false)
    }

    override fun dispose() {}
}
