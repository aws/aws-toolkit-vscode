// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels

import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.table.JBTable
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.CodeModernizerUIConstants
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobHistoryItem
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobHistoryTableModel
import software.aws.toolkits.jetbrains.services.codemodernizer.ui.components.PanelHeaderFactory
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.BorderFactory
import javax.swing.JPanel
import javax.swing.JScrollPane

class CodeModernizerJobHistoryTablePanel : JPanel(BorderLayout()) {
    var headerLabel = PanelHeaderFactory().createPanelHeader(message("codemodernizer.toolwindow.transformation.history.header"))
    val columnNames = arrayOf(
        message("codemodernizer.toolwindow.table.header.module_name"),
        message("codemodernizer.toolwindow.table.header.status"),
        message("codemodernizer.toolwindow.table.header.date"),
        message("codemodernizer.toolwindow.table.header.run_length"),
        message("codemodernizer.toolwindow.table.header.job_id"),
    )
    var tableData: Array<JobHistoryItem> = emptyArray()
    var tableModel = JobHistoryTableModel(tableData, columnNames)
    var jbTable: JBTable = JBTable(tableModel)
    var scrollPane: JScrollPane = ScrollPaneFactory.createScrollPane(jbTable, true)

    init {
        add(BorderLayout.NORTH, headerLabel)
        add(BorderLayout.CENTER, scrollPane)
    }

    fun setDefaultUI() {
        scrollPane.border = BorderFactory.createEmptyBorder(
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_TOP,
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_LEFT,
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_BOTTOM,
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_RIGHT
        )
        revalidate()
        repaint()
    }

    fun updateTableData(updateTableData: Array<JobHistoryItem>) {
        tableData = updateTableData
        tableModel = JobHistoryTableModel(tableData, columnNames)
        jbTable.model = tableModel
        jbTable.repaint()
        revalidate()
        repaint()
    }
}
