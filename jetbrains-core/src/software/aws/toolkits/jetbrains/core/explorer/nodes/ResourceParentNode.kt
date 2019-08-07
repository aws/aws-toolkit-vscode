// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.execution.ExecutionException
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info

interface ResourceParentNode {
    val nodeProject: Project

    fun isAlwaysShowPlus(): Boolean = true

    fun getChildren(): List<AwsExplorerNode<*>> = try {
        val children = getChildrenInternal()
        if (children.isEmpty()) {
            listOf(emptyChildrenNode())
        } else {
            children
        }
    } catch (e: ExecutionException) {
        getLogger(this::class).info(e) { "Failed to get children" }
        listOf(AwsExplorerErrorNode(nodeProject, e.cause ?: e))
    } catch (e: Exception) {
        getLogger(this::class).info(e) { "Failed to get children" }
        listOf(AwsExplorerErrorNode(nodeProject, e))
    }

    fun emptyChildrenNode(): AwsExplorerEmptyNode = AwsExplorerEmptyNode(nodeProject)

    fun getChildrenInternal(): List<AwsExplorerNode<*>>
}