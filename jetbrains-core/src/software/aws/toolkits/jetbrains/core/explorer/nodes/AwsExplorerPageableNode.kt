// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import javax.swing.Icon

/**
 * An [AwsExplorerNode] that is capable of handling pagination of is children.
 *
 * @see AwsTruncatedResultNode
 * @see AwsExplorerLoadingNode
 */
abstract class AwsExplorerPageableNode<T>(project: Project, value: T, icon: Icon?) :
    AwsExplorerNode<T>(project, value, icon) {

    private val childNodes: MutableList<AwsExplorerNode<*>> by lazy {
        val initialList = mutableListOf<AwsExplorerNode<*>>()

        val data = loadData()
        if (data.isEmpty()) {
            initialList.add(AwsExplorerEmptyNode(project))
        } else {
            initialList.addAll(data)
        }
        initialList
    }

    internal fun loadData(paginationToken: String? = null): Collection<AwsExplorerNode<*>> = try {
        loadResources(paginationToken)
    } catch (e: Exception) {
        LOG.warn(e) { "Failed to load AWS Explorer nodes" }
        // Return the ErrorNode as the single Node of the list
        listOf(AwsExplorerErrorNode(project!!, e))
    }

    protected abstract fun loadResources(paginationToken: String? = null): Collection<AwsExplorerNode<*>>

    final override fun getChildren(): MutableList<AwsExplorerNode<*>> = childNodes

    private companion object {
        private val LOG = getLogger<AwsExplorerPageableNode<*>>()
    }
}