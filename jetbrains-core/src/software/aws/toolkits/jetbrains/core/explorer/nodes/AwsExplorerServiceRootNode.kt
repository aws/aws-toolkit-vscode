// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.Resource

/**
 * Top level node for any AWS service node
 */
abstract class AwsExplorerServiceRootNode(project: Project, private val service: AwsExplorerServiceNode) :
    AwsExplorerNode<String>(project, service.displayName, null),
    ResourceActionNode,
    ResourceParentNode {

    val serviceId: String
        get() = service.serviceId

    override fun isAlwaysShowPlus(): Boolean = true
    override fun actionGroupName() = "aws.toolkit.explorer.$serviceId"
}

abstract class CacheBackedAwsExplorerServiceRootNode<T>(project: Project, service: AwsExplorerServiceNode, private val resource: Resource<out Collection<T>>) :
    AwsExplorerServiceRootNode(project, service) {

    final override fun getChildrenInternal(): List<AwsExplorerNode<*>> = AwsResourceCache.getInstance(nodeProject).getResourceNow(resource).map(this::toNode)

    abstract fun toNode(child: T): AwsExplorerNode<*>
}
