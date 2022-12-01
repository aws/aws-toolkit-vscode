// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import java.awt.event.MouseEvent
import javax.swing.Icon

abstract class AbstractActionTreeNode(project: Project, value: String, private val awsIcon: Icon?) : AbstractTreeNode<String>(project, value) {
    override fun update(presentation: PresentationData) {
        val attr = if (isEnabled()) {
            SimpleTextAttributes.REGULAR_ATTRIBUTES
        } else {
            SimpleTextAttributes.GRAYED_ATTRIBUTES
        }
        presentation.addText(value, attr)
        awsIcon?.let { presentation.setIcon(it) }
    }

    abstract fun onDoubleClick(event: MouseEvent)

    open fun isEnabled(): Boolean = true
    override fun getChildren(): Collection<AbstractTreeNode<*>> = emptyList()
}

interface ActionGroupOnRightClick {
    fun actionGroupName(): String
}

interface PinnedConnectionNode {
    fun feature(): FeatureWithPinnedConnection
}
