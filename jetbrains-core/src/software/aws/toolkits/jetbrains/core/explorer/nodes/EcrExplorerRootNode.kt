// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.jetbrains.services.ecr.EcrServiceNode
import software.aws.toolkits.resources.message

class EcrExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = EcrClient.SERVICE_NAME
    override val displayName: String = message("explorer.node.ecr")

    override fun buildServiceRootNode(project: Project) = EcrServiceNode(project, this)
}
