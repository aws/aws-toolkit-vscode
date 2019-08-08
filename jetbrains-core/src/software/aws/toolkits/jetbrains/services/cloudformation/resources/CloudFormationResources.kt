// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation.resources

import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.StackResourceSummary
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.filter

object CloudFormationResources {
    val LIST_STACKS: Resource.Cached<List<StackSummary>> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.list_stacks") {
            listStacksPaginator().stackSummaries().toList()
        }

    @JvmField
    val ACTIVE_STACKS = LIST_STACKS.filter { it.stackStatus() != StackStatus.DELETE_COMPLETE }.filter { it.stackName() != null }

    fun listStackResources(stackId: String): Resource.Cached<List<StackResourceSummary>> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.list_resources.$stackId") {
            listStackResourcesPaginator { it.stackName(stackId) }.stackResourceSummaries().toList()
        }
}