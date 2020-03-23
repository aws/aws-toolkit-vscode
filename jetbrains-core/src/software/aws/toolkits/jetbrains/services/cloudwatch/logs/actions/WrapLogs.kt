// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.project.DumbAware
import com.intellij.ui.table.TableView
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamMessageColumn
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.WrappingLogStreamMessageColumn
import software.aws.toolkits.resources.message

class WrapLogs(private val block: () -> TableView<LogStreamEntry>) :
    ToggleAction(message("cloudwatch.logs.wrap"), null, AllIcons.Actions.ToggleSoftWrap),
    DumbAware {
    private val messageColumn = 1
    private var isSelected = false
    override fun isSelected(e: AnActionEvent): Boolean = isSelected

    override fun setSelected(e: AnActionEvent, state: Boolean) {
        isSelected = state
        if (isSelected) {
            wrap()
        } else {
            unwrap()
        }
    }

    private fun wrap() {
        block().listTableModel.columnInfos[messageColumn] = WrappingLogStreamMessageColumn()
    }

    private fun unwrap() {
        block().listTableModel.columnInfos[messageColumn] = LogStreamMessageColumn()
    }
}
