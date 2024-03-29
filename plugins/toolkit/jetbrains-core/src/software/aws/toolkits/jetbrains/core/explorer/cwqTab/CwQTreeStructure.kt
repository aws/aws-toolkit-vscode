// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.cwqTab

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.util.treeView.AbstractTreeStructureBase
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project

class CwQTreeStructure(project: Project) : AbstractTreeStructureBase(project) {
    override fun getRootElement() = EP_NAME.extensions.first().create(myProject)

    override fun getProviders(): List<TreeStructureProvider>? = null

    override fun commit() {}

    override fun hasSomethingToCommit(): Boolean = false

    companion object {
        private val EP_NAME = ExtensionPointName.create<CwQRootNodeProvider>("aws.toolkit.cwq.rootNode")
    }
}

interface CwQRootNodeProvider {
    fun create(project: Project): Any
}
