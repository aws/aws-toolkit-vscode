// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.actions

import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import javax.swing.Icon

/**
 * An action from a [AwsExplorerResourceNode] that only operates on a single resource. Needed to constrain the type.
 *
 * Automatically disables the action if more than 1 node is selected.
 *
 * @see ExplorerNodeAction
 * @see SingleExplorerNodeAction
 */
abstract class SingleResourceNodeAction<in T : AwsExplorerResourceNode<*>>(text: String, description: String? = null, icon: Icon? = null) :
    SingleExplorerNodeAction<T>(text, description, icon)

/**
 * An action from a [AwsExplorerNode] that only operates on a single resource.
 *
 * Automatically disables the action if more than 1 node is selected.
 *
 * @see ExplorerNodeAction
 */
abstract class SingleExplorerNodeAction<in T : AwsExplorerNode<*>>(text: String, description: String? = null, icon: Icon? = null) :
    ExplorerNodeAction<T>(text, description, icon) {

    /**
     * If only a single item is selected [update] will be invoked with that selection periodically.
     *
     * @see AnAction.update
     * @see ExplorerNodeAction.update
     */
    open fun update(selected: T, e: AnActionEvent) {}

    /**
     * If only a single item is selected [actionPerformed] will be invoked when the action is performed.
     *
     * @see AnAction.actionPerformed
     * @see ExplorerNodeAction.actionPerformed
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
 * Converts generic [ExplorerNodeAction] list into [T] typed nodes
 */
abstract class ExplorerNodeAction<in T : AwsExplorerNode<*>>(text: String, description: String? = null, icon: Icon? = null) :
    AnAction(text, description, icon) {

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

    final override fun actionPerformed(e: AnActionEvent) {
        actionPerformed(e.selectedNodes(), e)
    }

    final override fun update(e: AnActionEvent) {
        update(e.selectedNodes(), e)
    }
}

abstract class SingleExplorerNodeActionGroup<in T : AwsExplorerNode<*>>(text: String? = null, description: String? = null, icon: Icon? = null) :
    ActionGroup(text, description, icon) {

    final override fun getChildren(e: AnActionEvent?) =
        e?.selectedNodes<T>()?.takeIf { it.size == 1 }?.first()?.let { getChildren(it, e) }?.toTypedArray() ?: emptyArray()

    abstract fun getChildren(selected: T, e: AnActionEvent): List<AnAction>
}

@Suppress("UNCHECKED_CAST")
private fun <T : AwsExplorerNode<*>> AnActionEvent?.selectedNodes(): List<T> = this?.getData(ExplorerDataKeys.SELECTED_NODES)?.mapNotNull { it as? T }
    ?: emptyList()
