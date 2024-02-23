// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.cwqTab

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.util.treeView.AbstractTreeStructureBase
import com.intellij.openapi.project.Project

class CwQTreeStructure(project: Project) : AbstractTreeStructureBase(project) {
    override fun getRootElement() = CwQTreeRootNode(myProject)

    override fun getProviders(): List<TreeStructureProvider>? = CwQTreeStructureProvider.EP_NAME.extensionList

    override fun commit() {}

    override fun hasSomethingToCommit(): Boolean = false
}
