// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.ecs.EcsClient
import software.aws.toolkits.jetbrains.services.ecs.EcsParentNode

class EcsExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = EcsClient.SERVICE_NAME
    override fun buildServiceRootNode(project: Project): AwsExplorerNode<*> = EcsParentNode(project, this)
}
