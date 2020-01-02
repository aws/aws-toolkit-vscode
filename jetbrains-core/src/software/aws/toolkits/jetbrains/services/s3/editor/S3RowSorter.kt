// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import javax.swing.table.TableModel
import javax.swing.table.TableRowSorter

// Class that makes the rows unsortable. TODO we should figure out how we want sort to work.
class S3RowSorter(model: TableModel) : TableRowSorter<TableModel>(model) {
    init {
        setSortable(0, false)
        setSortable(1, false)
        setSortable(2, false)
    }
}
