// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import software.aws.toolkits.jetbrains.components.telemetry.AnActionWrapper
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import javax.swing.Icon

/**
 * An action from a [AwsExplorerResourceNode] that only operates on a single resource.
 *
 * Automatically disables the action if more than 1 node is selected.
 *
 * @see ResourceNodeAction
 */
abstract class SingleResourceNodeAction<in T : AwsExplorerResourceNode<*>>(text: String, description: String? = null, icon: Icon? = null) : ResourceNodeAction<T>(text, description, icon) {

    /**
     * If only a single item is selected [update] will be invoked with that selection periodically.
     *
     * @see AnAction.update
     * @see ResourceNodeAction.update
     */
    open fun update(selected: T, e: AnActionEvent) {}

    /**
     * If only a single item is selected [actionPerformed] will be invoked when the action is performed.
     *
     * @see AnAction.actionPerformed
     * @see ResourceNodeAction.actionPerformed
     */
    abstract fun actionPerformed(selected: T, e: AnActionEvent)

    final override fun update(selected: List<T>, e: AnActionEvent) {
        e.presentation.isEnabled = selected.size == 1
        selected.singleOrNull()?.run { update(this, e) }
    }

    final override fun actionPerformed(selected: List<T>, e: AnActionEvent) {
        selected.singleOrNull()?.run { actionPerformed(this, e) }
    }
}

/**
 * Converts generic [ResourceNodeAction] list into [T] typed nodes
 */
abstract class ResourceNodeAction<in T : AwsExplorerResourceNode<*>>(text: String, description: String? = null, icon: Icon? = null) : AnActionWrapper(text, description, icon) {

    /**
     * Invoked periodically with the selected items of type [T].
     *
     * @see AnAction.update
     */
    open fun update(selected: List<T>, e: AnActionEvent) {}

    /**
     * Invoked when the action is performed with the selected items of type [T].
     *
     * @see AnAction.actionPerformed
     */
    abstract fun actionPerformed(selected: List<T>, e: AnActionEvent)

    final override fun doActionPerformed(e: AnActionEvent) {
        actionPerformed(selectedNodes(e), e)
    }

    final override fun update(e: AnActionEvent) {
        update(selectedNodes(e), e)
    }

    @Suppress("UNCHECKED_CAST")
    private fun selectedNodes(e: AnActionEvent?) = e?.getData(ExplorerDataKeys.SELECTED_RESOURCE_NODES)?.mapNotNull { it as? T } ?: emptyList()
}