// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import javax.swing.table.TableModel
import javax.swing.table.TableRowSorter
import javax.swing.table.TableStringConverter

class S3RowSorter(model: TableModel) : TableRowSorter<TableModel>(model) {
    init {
        stringConverter = object : TableStringConverter() {
            override fun toString(model: TableModel?, row: Int, column: Int): String? = model?.getValueAt(row, column)?.toString()
        }

        setSortable(0, false)
        setSortable(1, false)
        setSortable(2, false)
    }
}
