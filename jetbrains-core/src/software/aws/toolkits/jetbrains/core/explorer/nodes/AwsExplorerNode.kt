// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import javax.swing.Icon

/**
 * Top level class for any node in the AWS explorer tree
 */
abstract class AwsExplorerNode<T>(val nodeProject: Project, value: T, private val awsIcon: Icon?) :
    AbstractTreeNode<T>(nodeProject, value) {

    protected val region by lazy { nodeProject.activeRegion() }

    protected val credentialProvider by lazy { nodeProject.activeCredentialProvider() }

    override fun update(presentation: PresentationData) {
        presentation.let {
            it.setIcon(awsIcon)
            it.addText(displayName(), SimpleTextAttributes.REGULAR_ATTRIBUTES)
            statusText()?.let { status ->
                it.addText(" [$status]", SimpleTextAttributes.GRAY_ATTRIBUTES)
            }
        }
    }

    open fun displayName() = value.toString()

    open fun statusText(): String? = null

    /**
     * Called when the node is double clicked on
     */
    open fun onDoubleClick() {}

    override fun toString(): String = displayName()
}