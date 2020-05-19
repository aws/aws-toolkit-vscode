// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.ide.util.treeView.TreeState
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.resources.message

class RefreshSubTreeAction(
    treeTable: S3TreeTable
) : SingleS3ObjectAction(treeTable, message("general.refresh"), AllIcons.Actions.Refresh), DumbAware {
    override fun performAction(node: S3TreeNode) {
        val state = TreeState.createOn(treeTable.tree)
        treeTable.invalidateLevel(node)
        treeTable.refresh()
        state.applyTo(treeTable.tree)
    }
}
