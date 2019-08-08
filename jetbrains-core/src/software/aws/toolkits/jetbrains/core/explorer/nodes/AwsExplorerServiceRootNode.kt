// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerService

/**
 * Top level node for any AWS service node
 */
abstract class AwsExplorerServiceRootNode(project: Project, private val service: AwsExplorerService) :
    AwsExplorerNode<String>(project, service.displayName, null), ResourceParentNode {

    val serviceId: String
        get() = service.serviceId

    override fun isAlwaysShowPlus(): Boolean = true
}

abstract class CacheBackedAwsExplorerServiceRootNode<T>(project: Project, service: AwsExplorerService, private val resource: Resource<out Collection<T>>) :
    AwsExplorerServiceRootNode(project, service) {

    final override fun getChildrenInternal(): List<AwsExplorerNode<*>> = AwsResourceCache.getInstance(nodeProject).getResourceNow(resource).map(this::toNode)

    abstract fun toNode(child: T): AwsExplorerNode<*>
}