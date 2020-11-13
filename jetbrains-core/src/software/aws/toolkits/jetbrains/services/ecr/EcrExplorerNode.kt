// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository

class EcrServiceNode(project: Project, service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> =
        nodeProject.getResourceNow(EcrResources.LIST_REPOS).map { EcrRepositoryNode(nodeProject, it) }
}

class EcrRepositoryNode(project: Project, val repository: Repository) :
    AwsExplorerResourceNode<String>(project, EcrClient.SERVICE_NAME, repository.repositoryName) {

    override fun resourceType(): String = "repository"

    override fun resourceArn() = repository.repositoryArn

    override fun isAlwaysShowPlus(): Boolean = false

    override fun displayName(): String = repository.repositoryName
}
