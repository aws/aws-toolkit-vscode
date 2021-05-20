// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.ui.SeparatorWithText
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.components.BorderLayoutPanel
import software.aws.toolkits.jetbrains.services.dynamodb.Index
import java.awt.Component
import java.awt.Font
import javax.swing.JComponent
import javax.swing.JList
import javax.swing.ListCellRenderer
import javax.swing.border.Border

class IndexRenderer(private val model: IndexComboBoxModel) : ListCellRenderer<Index?> {
    private val rowRenderer = SimpleListCellRenderer.create<Index>("") { it.displayName }
    private val separator = SeparatorWithText().apply {
        textForeground = UIUtil.getListForeground()
        font = font.deriveFont(Font.PLAIN)
    }

    override fun getListCellRendererComponent(list: JList<out Index>, value: Index?, index: Int, isSelected: Boolean, cellHasFocus: Boolean): Component {
        val row = rowRenderer.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus) as JComponent

        val separatorName = model.separatorNames[index]
        return if (separatorName != null) {
            separator.caption = separatorName

            return object : BorderLayoutPanel() {
                override fun setBorder(border: Border?) {
                    // Redirect the border onto the row and not the panel, else it gets indented into the list and breaks highlighting
                    row.border = border
                }
            }.apply {
                background = UIUtil.getListBackground()

                addToTop(separator)
                addToCenter(row)
            }
        } else {
            row
        }
    }
}
