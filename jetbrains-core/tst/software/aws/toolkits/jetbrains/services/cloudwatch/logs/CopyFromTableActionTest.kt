// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.CopyFromTableAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamDateColumn
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamMessageColumn
import java.awt.datatransfer.DataFlavor

class CopyFromTableActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun copyMessages() {
        val tableModel = ListTableModel(
            arrayOf(LogStreamDateColumn(), LogStreamMessageColumn()),
            listOf(
                LogStreamEntry("abc", 0),
                LogStreamEntry("abcdefg", 1)
            )
        )
        val table = TableView(tableModel)
        val action = CopyFromTableAction(table)

        table.setRowSelectionInterval(0, 0)
        table.setColumnSelectionInterval(1, 1)

        action.actionPerformed(TestActionEvent(DataContext { projectRule.project }))
        var content = CopyPasteManager.getInstance().contents
        assertThat(content?.getTransferData(DataFlavor.stringFlavor)).isEqualTo("abc")

        table.setRowSelectionInterval(0, 1)
        action.actionPerformed(TestActionEvent(DataContext { projectRule.project }))
        content = CopyPasteManager.getInstance().contents
        assertThat(content?.getTransferData(DataFlavor.stringFlavor)).isEqualTo("abc\nabcdefg")

        table.setColumnSelectionInterval(0, 1)
        action.actionPerformed(TestActionEvent(DataContext { projectRule.project }))
        content = CopyPasteManager.getInstance().contents
        assertThat(content?.getTransferData(DataFlavor.stringFlavor)).isEqualTo("0\tabc\n1\tabcdefg")

        table.clearSelection()
        action.actionPerformed(TestActionEvent(DataContext { projectRule.project }))
        content = CopyPasteManager.getInstance().contents
        assertThat(content?.getTransferData(DataFlavor.stringFlavor)).isEqualTo("")
    }
}
