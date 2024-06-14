// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.ui

import com.intellij.ui.SimpleColoredRenderer
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTable
import javax.swing.border.CompoundBorder
import javax.swing.table.DefaultTableCellRenderer
import javax.swing.table.TableCellRenderer

abstract class ResizingColumnRenderer : TableCellRenderer, SimpleColoredRenderer() {
    private val defaultRenderer = DefaultTableCellRenderer()
    abstract fun getText(value: Any?): String?

    override fun getTableCellRendererComponent(table: JTable?, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int): Component {
        // This wrapper will let us force the component to be at the top instead of in the middle for linewraps
        val wrapper = JPanel(BorderLayout())

        // this is basically what ColoredTableCellRenderer is doing, but we can't override getTableCellRendererComponent on that class
        cellState.updateRenderer(defaultRenderer)

        val defaultComponent = defaultRenderer.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)
        if (table == null) {
            return defaultComponent
        }
        val component = defaultComponent as? JLabel ?: return defaultComponent

        // This will set the component text accordingly
        component.text = getText(value)

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
        }
        component.border = null
        return wrapper
    }
}
