package software.aws.toolkits.jetbrains.ui.credentials

import com.intellij.ui.table.TableView
import com.intellij.util.ui.ColumnInfo
import com.intellij.util.ui.ListTableModel
import software.aws.toolkits.jetbrains.credentials.CredentialProfile
import software.aws.toolkits.jetbrains.credentials.CredentialProfileFactory
import java.util.function.Function
import javax.swing.JTable
import javax.swing.RowSorter
import javax.swing.SortOrder
import javax.swing.table.TableRowSorter

class CredentialsTable : TableView<CredentialProfile>(createModel()) {
    init {
        autoResizeMode = (JTable.AUTO_RESIZE_LAST_COLUMN)
        isStriped = true
        emptyText.text = "No credentials configured"
        model.isSortable = true
        tableHeader.reorderingAllowed = false


        val sorter = TableRowSorter<ListTableModel<CredentialProfile>>(model)
        sorter.setSortable(0, true)
        sorter.setSortable(1, true)
        sorter.sortsOnUpdates = true
        sorter.sortKeys = listOf(RowSorter.SortKey(0, SortOrder.ASCENDING))

        rowSorter = sorter
    }

    @Suppress("UNCHECKED_CAST")
    override fun getModel(): ListTableModel<CredentialProfile> {
        return super.getModel() as ListTableModel<CredentialProfile>
    }

    private companion object {
        private fun createModel(): ListTableModel<CredentialProfile> {
            val listTableModel = ListTableModel<CredentialProfile>(*createColumnInfo())
            listTableModel.isSortable = true

            return listTableModel;
        }

        private fun createColumnInfo(): Array<ColumnInfo<CredentialProfile, String>> {
            val columnInfo = arrayOf<ColumnInfo<CredentialProfile, String>>(
                    CredentialProfileColumn("Profile Name", Function { it.name }),
                    CredentialProfileColumn("Type", Function {
                        CredentialProfileFactory.factoryFor(it.id)!!.description
                    })
            )

            return columnInfo
        }
    }

    private class CredentialProfileColumn constructor(columnName: String,
                                                      private val valueExtractor: Function<CredentialProfile, String>)
        : ColumnInfo<CredentialProfile, String>(columnName) {
        override fun valueOf(credentialProfile: CredentialProfile): String? {
            return valueExtractor.apply(credentialProfile)
        }
    }
}
