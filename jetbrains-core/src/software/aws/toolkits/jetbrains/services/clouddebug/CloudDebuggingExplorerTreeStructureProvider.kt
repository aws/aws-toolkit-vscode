// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.util.treeView.AbstractTreeNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerTreeStructureProvider
import software.aws.toolkits.jetbrains.services.ecs.EcsClusterNode
import software.aws.toolkits.jetbrains.services.ecs.EcsServiceNode
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils

class CloudDebuggingExplorerTreeStructureProvider : AwsExplorerTreeStructureProvider {
    override fun modify(
        parent: AbstractTreeNode<*>,
        children: MutableCollection<AbstractTreeNode<*>>,
        settings: ViewSettings?
    ): MutableCollection<AbstractTreeNode<*>> =
        when (parent) {
            is EcsClusterNode -> children
                .sortedWith(Comparator { x, y ->
                    val service1 = (x as? EcsServiceNode)?.resourceArn()?.toLowerCase() ?: ""
                    val service2 = (y as? EcsServiceNode)?.resourceArn()?.toLowerCase() ?: ""
                    val value = EcsUtils.originalServiceName(service1).compareTo(EcsUtils.originalServiceName(service2))
                    if (value != 0) {
                        value
                    } else {
                        // Always put the instrumented service first
                        if (EcsUtils.isInstrumented(service1)) {
                            -1
                        } else {
                            1
                        }
                    }
                })
                .toMutableList()
            else -> children
        }
}
