// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketEditor

import com.intellij.openapi.application.runInEdt
import com.intellij.ui.treeStructure.treetable.TreeTable

open class S3TreeTable(private val treeTableModel: S3TreeTableModel) : TreeTable(treeTableModel) {

    fun refresh() {
        runInEdt {
            clearSelection()
            val structureTreeModel = treeTableModel.structureTreeModel
            structureTreeModel.invalidate()
        }
    }
}
