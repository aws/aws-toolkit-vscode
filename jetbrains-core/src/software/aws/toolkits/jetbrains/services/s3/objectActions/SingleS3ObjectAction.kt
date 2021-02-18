// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.actionSystem.DataContext
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import javax.swing.Icon

abstract class SingleS3ObjectAction(title: String, icon: Icon? = null) : S3ObjectAction(title, icon) {
    final override fun performAction(dataContext: DataContext, nodes: List<S3TreeNode>) {
        if (nodes.size != 1) {
            throw IllegalStateException("SingleActionNode should only have a single node, got $nodes")
        }
        performAction(dataContext, nodes.first())
    }

    final override fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.size == 1 && enabled(nodes.first())

    protected abstract fun performAction(dataContext: DataContext, node: S3TreeNode)

    protected open fun enabled(node: S3TreeNode): Boolean = true
}
