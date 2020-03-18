// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.testFramework.TestActionEvent
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.WrapLogs
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamDateColumn
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamMessageColumn
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.WrappingLogStreamMessageColumn

class WrapLogsTest {
    @Test
    fun wrappingChangesModel() {
        val model = ListTableModel<OutputLogEvent>(LogStreamDateColumn(), LogStreamMessageColumn())
        val table = TableView<OutputLogEvent>(model)
        val wrapLogsAction = WrapLogs(table)
        wrapLogsAction.setSelected(TestActionEvent(), true)
        assertThat(model.columnInfos[1]).isInstanceOf(WrappingLogStreamMessageColumn::class.java)
        wrapLogsAction.setSelected(TestActionEvent(), false)
        assertThat(model.columnInfos[1]).isInstanceOf(LogStreamMessageColumn::class.java)
    }
}
