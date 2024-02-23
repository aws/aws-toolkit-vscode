// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.WrapLogsAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamDateColumn
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamMessageColumn
import java.awt.Container

class WrapLogsActionTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun wrappingChangesModel() {
        val model = ListTableModel<LogStreamEntry>(
            arrayOf(LogStreamDateColumn(), LogStreamMessageColumn()),
            listOf(mock())
        )
        val table = TableView(model)
        val wrapLogsAction = WrapLogsAction(projectRule.project) { table }
        wrapLogsAction.setSelected(TestActionEvent(), true)
        val wrappedComponent = model.columnInfos[1].getRenderer(null)!!.getTableCellRendererComponent(table, 0, false, false, 0, 0)

        val textArea = (wrappedComponent as Container).getComponent(0)

        assertThat(textArea).isInstanceOf(JBTextArea::class.java)
        assertThat((textArea as JBTextArea).lineWrap).isTrue()

        wrapLogsAction.setSelected(TestActionEvent(), false)
        val component = model.columnInfos[1].getRenderer(null)!!.getTableCellRendererComponent(table, 0, false, false, 0, 0)
        val textArea2 = (component as Container).getComponent(0)

        assertThat(textArea2).isInstanceOf(JBTextArea::class.java)
        assertThat((textArea2 as JBTextArea).lineWrap).isFalse()
    }
}
