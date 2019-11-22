// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.util.treeView.AbstractTreeStructureBase
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerRootNode

class AwsExplorerTreeStructure(project: Project) : AbstractTreeStructureBase(project) {
    override fun getProviders(): List<TreeStructureProvider>? = defaultTreeStructureProvider + AwsExplorerTreeStructureProvider.EP_NAME.extensionList

    override fun getRootElement() = AwsExplorerRootNode(myProject)

    override fun commit() {}

    override fun hasSomethingToCommit() = false

    override fun isToBuildChildrenInBackground(element: Any) = true

    companion object {
        val defaultTreeStructureProvider = listOf(DefaultAwsExplorerTreeStructureProvider())
    }
}
