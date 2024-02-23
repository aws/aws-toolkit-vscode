// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.ecr.EcrRepositoryNode
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.resources.message

class DeleteRepositoryAction : DeleteResourceAction<EcrRepositoryNode>(message("ecr.delete.repo.action")) {
    override fun performDelete(selected: EcrRepositoryNode) {
        val client: EcrClient = selected.nodeProject.awsClient()
        client.deleteRepository { it.repositoryName(selected.repository.repositoryName) }
        selected.nodeProject.refreshAwsTree(EcrResources.LIST_REPOS)
    }
}
