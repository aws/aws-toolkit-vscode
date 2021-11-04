// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.EditorFontType
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.TableSpeedSearch
import com.intellij.ui.table.JBTable
import com.intellij.util.containers.BidirectionalMap
import com.intellij.util.containers.Convertor
import com.intellij.util.ui.StatusText
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.services.dynamodb.DynamoAttribute
import software.aws.toolkits.jetbrains.services.dynamodb.Index
import software.aws.toolkits.jetbrains.services.dynamodb.SearchResults
import software.aws.toolkits.resources.message
import javax.swing.table.AbstractTableModel
import javax.swing.table.DefaultTableCellRenderer

class TableResults : JBTable(TableModel(BidirectionalMap(), emptyList())) {
    init {
        // Make sure we call the method, and not edit the protected field
        setAutoResizeMode(AUTO_RESIZE_ALL_COLUMNS)
        setCellSelectionEnabled(true)

        font = EditorColorsManager.getInstance().globalScheme.getFont(EditorFontType.PLAIN)

        getTableHeader().reorderingAllowed = false

        val tableCellRenderer = DefaultTableCellRenderer()
        tableCellRenderer.putClientProperty("html.disable", true)
        setDefaultRenderer(Any::class.java, tableCellRenderer)

        TableSpeedSearch(this, Convertor { (it as? DynamoAttribute<*>)?.stringRepresentation() })
    }

    override fun getModel(): TableModel = super.getModel() as TableModel

    fun setResults(index: Index, results: SearchResults) {
        model = TableModel.buildModel(index, results)
        emptyText.text = StatusText.getDefaultEmptyText()
        setPaintBusy(false)
    }

    fun setError(e: Exception) {
        emptyText.setText(e.message ?: message("general.unknown_error"), SimpleTextAttributes.ERROR_ATTRIBUTES)
        setPaintBusy(false)
    }
}

class TableModel(private val columns: BidirectionalMap<String, Int>, private val data: List<Map<String, DynamoAttribute<*>>>) : AbstractTableModel() {
    override fun getRowCount(): Int = data.size
    override fun getColumnCount(): Int = columns.size
    override fun getColumnName(column: Int): String = columns.getKeysByValue(column)?.firstOrNull() ?: ""

    override fun getValueAt(rowIndex: Int, columnIndex: Int): String? {
        val columnName = getColumnName(columnIndex)
        return data[rowIndex][columnName]?.stringRepresentation()
    }

    companion object {
        fun buildModel(index: Index, data: SearchResults): TableModel {
            // Build the columns by putting the index fields first, then sort the rest of the attributes by name (alphabetically)
            val columns = buildList<String> {
                add(index.partitionKey)
                index.sortKey?.let {
                    add(it)
                }

                val attributes = data.asSequence()
                    .flatMap { it.keys.asSequence() }
                    .filterNot { it == index.partitionKey || it == index.sortKey }
                    .toSortedSet()

                addAll(attributes)
            }
                .asSequence()
                .mapIndexed { idx, attribute -> attribute to idx }
                .toMap(BidirectionalMap())

            return TableModel(columns, data)
        }
    }
}
