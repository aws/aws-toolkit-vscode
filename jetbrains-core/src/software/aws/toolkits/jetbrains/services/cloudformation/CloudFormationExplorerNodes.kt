// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.CacheBackedAwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.services.cloudformation.resources.CloudFormationResources
import software.aws.toolkits.jetbrains.utils.toHumanReadable

class CloudFormationServiceNode(project: Project, service: AwsExplorerServiceNode) : CacheBackedAwsExplorerServiceRootNode<StackSummary>(
    project,
    service,
    CloudFormationResources.ACTIVE_STACKS
) {
    override fun toNode(child: StackSummary): AwsExplorerNode<*> = CloudFormationStackNode(nodeProject, child.stackName(), child.stackStatus(), child.stackId())
}

class CloudFormationStackNode(
    project: Project,
    val stackName: String,
    private val stackStatus: StackStatus,
    val stackId: String
) : AwsExplorerResourceNode<String>(
        project,
        CloudFormationClient.SERVICE_NAME,
        stackName,
        AwsIcons.Resources.CLOUDFORMATION_STACK
) {
    override fun resourceType() = "stack"

    override fun resourceArn() = stackId

    override fun displayName() = stackName

    override fun statusText(): String? = stackStatus.toString().toHumanReadable()
}
