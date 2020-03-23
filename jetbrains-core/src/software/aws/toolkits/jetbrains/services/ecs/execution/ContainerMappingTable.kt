// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.execution.util.ListTableWithButtons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.ui.CommonActionsPanel
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.TableUtil
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.StatusText

abstract class ContainerMappingTable<T>(emptyTableMainText: String, addNewEntryText: String) : ListTableWithButtons<T>() {

    init {
        tableView.apply {
            emptyText.text = emptyTableMainText

            emptyText.appendSecondaryText(
                addNewEntryText,
                SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, JBUI.CurrentTheme.Link.linkColor())
            ) {
                stopEditing()

                val listModel = tableView.listTableModel
                listModel.addRow(createElement())

                val index = listModel.rowCount - 1
                tableView.setRowSelectionInterval(index, index)

                ApplicationManager.getApplication().invokeLater {
                    TableUtil.scrollSelectionToVisible(tableView)
                    TableUtil.editCellAt(tableView, index, 0)
                }
            }

            val shortcutSet = CommonActionsPanel.getCommonShortcut(CommonActionsPanel.Buttons.ADD)
            shortcutSet?.shortcuts?.firstOrNull()?.let { shortcut ->
                emptyText.appendSecondaryText(" (${KeymapUtil.getShortcutText(shortcut)})", StatusText.DEFAULT_ATTRIBUTES, null)
            }
        }
    }

    override fun canDeleteElement(selection: T): Boolean = true
}
