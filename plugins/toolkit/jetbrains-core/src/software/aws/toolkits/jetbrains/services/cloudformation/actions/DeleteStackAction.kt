// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation.actions

import com.intellij.openapi.application.runInEdt
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationStackNode
import software.aws.toolkits.jetbrains.services.cloudformation.resources.CloudFormationResources
import software.aws.toolkits.jetbrains.services.cloudformation.stack.StackWindowManager
import software.aws.toolkits.jetbrains.services.cloudformation.waitForStackDeletionComplete
import software.aws.toolkits.resources.message

class DeleteStackAction : DeleteResourceAction<CloudFormationStackNode>(message("cloudformation.stack.delete.action")) {
    override fun performDelete(selected: CloudFormationStackNode) {
        val client: CloudFormationClient = selected.nodeProject.awsClient()
        client.deleteStack { it.stackName(selected.stackName) }
        runInEdt {
            StackWindowManager.getInstance(selected.nodeProject).openStack(selected.stackName, selected.stackId)
        }
        client.waitForStackDeletionComplete(selected.stackName)
        selected.nodeProject.refreshAwsTree(CloudFormationResources.ACTIVE_STACKS)
    }
}
