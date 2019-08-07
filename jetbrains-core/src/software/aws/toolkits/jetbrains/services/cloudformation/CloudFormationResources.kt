// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource

object CloudFormationResources {
    @JvmField
    val ACTIVE_STACK_SUMMARIES = ClientBackedCachedResource(CloudFormationClient::class, "cfn.active_stacks") {
        listStacksPaginator()
            .stackSummaries()
            .filter { it.stackStatus() != StackStatus.DELETE_COMPLETE }
            .filterNotNull()
            .filter { it.stackName() != null }
            .toList()
    }

    @JvmField
    val ACTIVE_STACKS: Resource<List<Stack>> = Resource.View(ACTIVE_STACK_SUMMARIES) { map { Stack(it.stackName(), it.stackId()) } }
}

data class Stack(val name: String, val id: String? = null) {
    override fun toString() = name
}