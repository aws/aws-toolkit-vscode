// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.getResourceNow

/**
 * Top level node for any AWS service node
 */
abstract class AwsExplorerServiceRootNode(project: Project, service: AwsExplorerServiceNode) :
    AwsExplorerNode<AwsExplorerServiceNode>(project, service, null),
    ResourceActionNode,
    ResourceParentNode {

    private val serviceId = service.serviceId

    abstract override fun displayName(): String

    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()
    override fun isAlwaysShowPlus(): Boolean = true
    override fun actionGroupName() = "aws.toolkit.explorer.$serviceId"
}

abstract class CacheBackedAwsExplorerServiceRootNode<T>(project: Project, service: AwsExplorerServiceNode, private val resource: Resource<out Collection<T>>) :
    AwsExplorerServiceRootNode(project, service) {

    final override fun getChildrenInternal(): List<AwsExplorerNode<*>> = nodeProject.getResourceNow(resource).map(this::toNode)

    abstract fun toNode(child: T): AwsExplorerNode<*>
}
