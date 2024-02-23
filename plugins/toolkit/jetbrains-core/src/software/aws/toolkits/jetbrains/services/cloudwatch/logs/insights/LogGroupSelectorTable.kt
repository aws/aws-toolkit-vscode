// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.ui.TableSpeedSearch
import com.intellij.ui.TableUtil
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ColumnInfo
import com.intellij.util.ui.ListTableModel
import software.aws.toolkits.resources.message

data class LogGroup(
    var selected: Boolean = false,
    var name: String
)

class LogGroupSelectorTable : TableView<LogGroup>(model) {
    init {
        listTableModel.items = emptyList()
        TableSpeedSearch(this)
        emptyText.text = message("loading_resource.loading")
    }

    fun populateLogGroups(selectedLogGroups: Set<String>, availableLogGroups: List<String>) {
        val (selected, modelItems) = availableLogGroups.mapIndexed { index, logGroup ->
            if (logGroup in selectedLogGroups) {
                index to LogGroup(true, logGroup)
            } else {
                null to LogGroup(false, logGroup)
            }
        }.unzip()

        listTableModel.items = modelItems
        TableUtil.setupCheckboxColumn(this, 0)
        TableUtil.updateScroller(this)
        TableUtil.selectRows(this, selected.filterNotNull().toIntArray())
        TableUtil.scrollSelectionToVisible(this)
    }

    /**
     * Assumes that the model has already been populated
     */
    internal fun selectLogGroups(selectedLogGroups: Set<String>) {
        val selected = listTableModel.items.mapIndexed { index, logGroup ->
            logGroup.selected = logGroup.name in selectedLogGroups

            if (logGroup.selected) index else null
        }

        TableUtil.selectRows(this, selected.filterNotNull().toIntArray())
        TableUtil.scrollSelectionToVisible(this)
    }

    fun getSelectedLogGroups(): List<String> =
        listTableModel.items
            .filter { it.selected }
            .mapNotNull { it.name }

    companion object {
        private val model = ListTableModel<LogGroup>(
            SelectedColumnInfo(),
            LogGroupNameColumnInfo()
        )

        private class SelectedColumnInfo : ColumnInfo<LogGroup, Boolean>("Selected") {
            override fun getColumnClass() = Boolean::class.java

            override fun isCellEditable(item: LogGroup) = true

            override fun valueOf(item: LogGroup) = item.selected

            override fun setValue(item: LogGroup, value: Boolean?) {
                item.selected = (value ?: false)
            }
        }

        private class LogGroupNameColumnInfo : ColumnInfo<LogGroup, String>("Log Group Name") {
            override fun isCellEditable(item: LogGroup) = false

            override fun valueOf(item: LogGroup) = item.name

            override fun setValue(item: LogGroup, value: String?) {
                item.name = (value ?: "")
            }
        }
    }
}
