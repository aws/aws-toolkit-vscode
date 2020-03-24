// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.ui.components.JBTextArea
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamDateColumn
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamMessageColumn

class TableUtilsTest {
    private val event = OutputLogEvent.builder().message("aaaaaaaaaaaaaaaaaaaaaaaaaaaaa aaaaaaaaaaaaaaaaaaaa").build().toLogStreamEntry()

    @Test
    fun wrappingColumnMakesTallComponent() {
        val model = ListTableModel<LogStreamEntry>(LogStreamMessageColumn())
        model.addRow(event)
        val table = TableView(model)
        val renderer = LogStreamMessageColumn()
        renderer.wrap()
        val wrappingRenderer = renderer.getRenderer(event)
        val wrappingComponent = wrappingRenderer?.getTableCellRendererComponent(table, event.message, true, true, 0, 0)
        assertThat(wrappingComponent).isInstanceOf(JBTextArea::class.java)
        assertThat(wrappingComponent?.height).isNotZero()
        assertThat(wrappingComponent?.preferredSize?.height).isGreaterThan(wrappingComponent?.height)
    }

    @Test
    fun normalRendererDoesNotWrap() {
        val model = ListTableModel<LogStreamEntry>(LogStreamMessageColumn())
        model.addRow(event)
        val table = TableView(model)
        val renderer = table.getDefaultRenderer(LogStreamMessageColumn::class.java)
        val component = renderer?.getTableCellRendererComponent(table, event.message, true, true, 0, 0)
        assertThat(component?.height).isZero()
        assertThat(component?.preferredSize?.height).isGreaterThan(10)
    }

    @Test
    fun componentIsHighlighedOnSelection() {
        val model = ListTableModel<LogStreamEntry>(LogStreamDateColumn(), LogStreamMessageColumn())
        val table = TableView<LogStreamEntry>(model)
        val selectedComponent = model.columnInfos[1].getRenderer(null)!!.getTableCellRendererComponent(table, 0, true, false, 0, 0)
        assertThat(selectedComponent).isInstanceOf(JBTextArea::class.java)
        assertThat(selectedComponent.background).isEqualTo(table.selectionBackground)
        assertThat(selectedComponent.foreground).isEqualTo(table.selectionForeground)
        val component = model.columnInfos[1].getRenderer(null)!!.getTableCellRendererComponent(table, 0, false, false, 0, 0)
        assertThat(component).isInstanceOf(JBTextArea::class.java)
        assertThat(component.background).isEqualTo(table.background)
        assertThat(component.foreground).isEqualTo(table.foreground)
    }
}
