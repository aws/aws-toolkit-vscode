// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.util.treeView.AbstractTreeStructureBase
import com.intellij.openapi.project.Project

class DevToolsTreeStructure(project: Project) : AbstractTreeStructureBase(project) {
    override fun getRootElement() = DevToolsTreeRootNode(myProject)

    override fun getProviders(): List<TreeStructureProvider>? = DevToolsTreeStructureProvider.EP_NAME.extensionList

    override fun commit() {}

    override fun hasSomethingToCommit(): Boolean = false
}
