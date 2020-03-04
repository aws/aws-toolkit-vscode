// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationServiceNode
import software.aws.toolkits.resources.message

class CloudFormationExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = CloudFormationClient.SERVICE_NAME
    override val displayName: String = message("explorer.node.cloudformation")

    override fun buildServiceRootNode(project: Project) = CloudFormationServiceNode(project, this)
}
