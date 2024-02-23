// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.openapi.Disposable
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.SideBorder
import software.amazon.awssdk.services.cloudformation.model.StackEvent
import software.aws.toolkits.jetbrains.utils.ui.WrappingCellRenderer
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JComponent
import javax.swing.JTable
import javax.swing.table.DefaultTableCellRenderer

/**
 * Events table
 */
interface EventsTable : View {
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

class StatusCellRenderer : DefaultTableCellRenderer() {
    override fun getTableCellRendererComponent(table: JTable, value: Any, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int): Component =
        super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column).also {
            it.foreground = StatusType.fromStatusValue(value as String).color
        }
}

internal class EventsTableImpl : EventsTable, Disposable {

    private val logicalId = DynamicTableView.Field<StackEvent>(message("cloudformation.stack.logical_id")) { e -> e.logicalResourceId() }
    private val physicalId = DynamicTableView.Field<StackEvent>(message("cloudformation.stack.physical_id")) { e -> e.physicalResourceId() }

    private val table = DynamicTableView(
        DynamicTableView.Field(message("general.time")) { e -> e.timestamp() },
        // CFN Resource Status does not match what we expect (StackStatus enum)
        DynamicTableView.Field(message("cloudformation.stack.status"), renderer = StatusCellRenderer()) { e -> e.resourceStatusAsString() },
        logicalId,
        physicalId,
        DynamicTableView.Field(
            message("cloudformation.stack.reason"),
            WrappingCellRenderer(wrapOnSelection = true, wrapOnToggle = false)
        ) { e -> e.resourceStatusReason() ?: "" }
    ).apply { component.border = IdeBorderFactory.createBorder(SideBorder.BOTTOM) }

    override val component: JComponent = table.component

    override fun showBusyIcon() {
        table.showBusy(true)
    }

    override fun insertEvents(events: List<StackEvent>, pageChanged: Boolean) {
        table.updateItems(events, clearExisting = pageChanged)
    }

    override fun dispose() {}
}
