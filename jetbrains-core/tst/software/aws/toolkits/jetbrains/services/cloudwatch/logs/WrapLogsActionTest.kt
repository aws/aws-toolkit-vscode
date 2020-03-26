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
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.WrapLogsAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamDateColumn
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamMessageColumn

class WrapLogsActionTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun wrappingChangesModel() {
        val model = ListTableModel<LogStreamEntry>(LogStreamDateColumn(), LogStreamMessageColumn())
        val table = TableView(model)
        val wrapLogsAction = WrapLogsAction(projectRule.project) { table }
        wrapLogsAction.setSelected(TestActionEvent(), true)
        val wrappedComponent = model.columnInfos[1].getRenderer(null)!!.getTableCellRendererComponent(table, 0, false, false, 0, 0)
        assertThat(wrappedComponent).isInstanceOf(JBTextArea::class.java)
        assertThat((wrappedComponent as JBTextArea).wrapStyleWord).isTrue()
        assertThat(wrappedComponent.lineWrap).isTrue()

        wrapLogsAction.setSelected(TestActionEvent(), false)
        val component = model.columnInfos[1].getRenderer(null)!!.getTableCellRendererComponent(table, 0, false, false, 0, 0)
        assertThat(component).isInstanceOf(JBTextArea::class.java)
        assertThat((component as JBTextArea).wrapStyleWord).isFalse()
        assertThat(component.lineWrap).isFalse()
    }
}
