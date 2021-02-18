// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.ide.util.treeView.TreeState
import com.intellij.openapi.actionSystem.DataContext
import software.aws.toolkits.jetbrains.core.utils.getRequiredData
import software.aws.toolkits.jetbrains.services.s3.editor.S3EditorDataKeys
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.resources.message

class RefreshTreeAction : S3ObjectAction(message("general.refresh"), AllIcons.Actions.Refresh) {
    override fun performAction(dataContext: DataContext, nodes: List<S3TreeNode>) {
        val treeTable = dataContext.getRequiredData(S3EditorDataKeys.BUCKET_TABLE)
        val node = nodes.firstOrNull() ?: treeTable.rootNode

        val state = TreeState.createOn(treeTable.tree)
        treeTable.invalidateLevel(node)
        treeTable.refresh()
        state.applyTo(treeTable.tree)
    }

    override fun enabled(nodes: List<S3TreeNode>) = nodes.isEmpty() ||
        (nodes.size == 1 && nodes.first().let { it is S3TreeObjectNode || it is S3TreeDirectoryNode })
}
