package software.aws.toolkits.jetbrains.ui

import com.intellij.ui.table.TableView
import com.intellij.util.ui.ColumnInfo
import com.intellij.util.ui.ListTableModel
import javax.swing.JTable
import javax.swing.RowSorter
import javax.swing.SortOrder
import javax.swing.table.TableRowSorter

class KeyValueTable(initialItems: List<KeyValue> = mutableListOf()) : TableView<KeyValue>(createModel()) {
    init {
        autoResizeMode = (JTable.AUTO_RESIZE_LAST_COLUMN)
        isStriped = true
        emptyText.text = "No entries"
        tableHeader.reorderingAllowed = false

        val sorter = TableRowSorter<ListTableModel<KeyValue>>(model)
        sorter.setSortable(0, true)
        sorter.setSortable(1, true)
        sorter.sortsOnUpdates = true
        sorter.sortKeys = listOf(RowSorter.SortKey(0, SortOrder.ASCENDING))

        rowSorter = sorter

        model.items = initialItems
    }

    var isBusy: Boolean = false
        set(busy) {
            setPaintBusy(busy)
            field = busy
        }

    @Suppress("UNCHECKED_CAST")
    override fun getModel(): ListTableModel<KeyValue> {
        return super.getModel() as ListTableModel<KeyValue>
    }

    companion object {
        private fun createModel(): ListTableModel<KeyValue> {
            val tableModel = ListTableModel<KeyValue>(*createColumns())
            tableModel.isSortable = true

            return tableModel
        }

        private fun createColumns(): Array<StringColumn> {
            return arrayOf(
                    StringColumn("Key", { it.key }),
                    StringColumn("Value", { it.value })
            )
        }
    }
}

private class StringColumn(name: String, private val extractor: (KeyValue) -> String)
    : ColumnInfo<KeyValue, String>(name) {
    override fun valueOf(keyValue: KeyValue): String {
        return extractor.invoke(keyValue)
    }
}

data class KeyValue(var key: String, var value: String)
