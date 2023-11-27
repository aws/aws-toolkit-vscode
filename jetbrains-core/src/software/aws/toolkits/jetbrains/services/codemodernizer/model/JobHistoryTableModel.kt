// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import javax.swing.table.AbstractTableModel

class JobHistoryTableModel(
    private val data: Array<JobHistoryItem>,
    private val columnNames: Array<String>
) : AbstractTableModel() {
    override fun getRowCount(): Int = data.size

    override fun getColumnCount(): Int = columnNames.size

    override fun getValueAt(row: Int, col: Int): Any = data[row][col]

    override fun getColumnName(col: Int): String = columnNames[col]

    override fun isCellEditable(row: Int, col: Int): Boolean = false
}
