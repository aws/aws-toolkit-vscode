// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights
import com.intellij.execution.util.ListTableWithButtons
import com.intellij.openapi.project.Project
import com.intellij.util.ui.ListTableModel
import software.aws.toolkits.resources.message
import javax.swing.table.TableCellEditor

// TODO: fix this whole thing
class AddRemoveLogGroupTable(project: Project) : ListTableWithButtons<SelectedLogGroups> () {
    init {
        // Currently shows a sample table
        // TODO Display log entries, Add and Remove log groups
    }
    override fun cloneElement(variable: SelectedLogGroups): SelectedLogGroups = variable
    override fun createElement(): SelectedLogGroups = mutableListOf()
    fun getSelLogGroups(): List<SelectedLogGroups> = elements.toList()

    override fun createListModel(): ListTableModel<*> = ListTableModel<SelectedLogGroups>(
        StringColInfo(
            message("cloudwatch.logs.selected_log_groups"),
            { it.first() },
            { mapping, value -> }
        )
    )

    override fun canDeleteElement(selection: SelectedLogGroups?): Boolean = true
    override fun isEmpty(element: SelectedLogGroups): Boolean = element.isNullOrEmpty()

    private inner class StringColInfo(
        name: String,
        private val retrieveFunc: (SelectedLogGroups) -> String?,
        private val setFunc: (SelectedLogGroups, String?) -> Unit,
        private val editor: () -> TableCellEditor? = { null }
    ) : ListTableWithButtons.ElementsColumnInfoBase<SelectedLogGroups>(name) {
        override fun valueOf(item: SelectedLogGroups): String? = retrieveFunc.invoke(item)

        override fun setValue(item: SelectedLogGroups, value: String?) {
            if (value == valueOf(item)) {
                return
            }
            setFunc.invoke(item, value)
            setModified()
        }

        override fun isCellEditable(item: SelectedLogGroups?): Boolean = false
        override fun getDescription(element: SelectedLogGroups?): String? = null
    }
}
