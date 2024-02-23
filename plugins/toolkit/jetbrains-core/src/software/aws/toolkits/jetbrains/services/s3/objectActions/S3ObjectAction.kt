// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.s3.editor.S3EditorDataKeys
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeErrorNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import javax.swing.Icon

abstract class S3ObjectAction(title: String, icon: Icon? = null) : DumbAwareAction(title, null, icon) {
    final override fun actionPerformed(e: AnActionEvent) = performAction(e.dataContext, selected(e.dataContext).filter { it !is S3TreeContinuationNode<*> })

    protected abstract fun performAction(dataContext: DataContext, nodes: List<S3TreeNode>)

    final override fun update(e: AnActionEvent) {
        val bucketViewer = e.dataContext.getData(S3EditorDataKeys.BUCKET_TABLE)
        // Disable the action if the bucket viewer is not in our UI hierarchy
        if (bucketViewer == null) {
            e.presentation.isEnabledAndVisible = false
            return
        }

        val selected = selected(e.dataContext)
        e.presentation.isEnabled = selected.none { it is S3TreeContinuationNode<*> || it is S3TreeErrorNode } && enabled(selected)
    }

    private fun selected(dataContext: DataContext): List<S3TreeNode> = dataContext.getData(S3EditorDataKeys.SELECTED_NODES) ?: emptyList()

    protected open fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.isNotEmpty()
}
