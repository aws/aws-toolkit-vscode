// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceActionNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceParentNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.resources.message

class EcrServiceNode(project: Project, service: AwsExplorerServiceNode) : AwsExplorerServiceRootNode(project, service) {
    override fun displayName(): String = message("explorer.node.ecr")

    override fun getChildrenInternal(): List<AwsExplorerNode<*>> =
        nodeProject.getResourceNow(EcrResources.LIST_REPOS).map { EcrRepositoryNode(nodeProject, it) }
}

class EcrRepositoryNode(
    project: Project,
    val repository: Repository
) :
    AwsExplorerResourceNode<String>(
        project,
        EcrClient.SERVICE_NAME,
        repository.repositoryName,
        AwsIcons.Resources.ECR_REPOSITORY
    ),
    ResourceParentNode {

    override fun resourceType(): String = "repository"

    override fun resourceArn() = repository.repositoryArn

    override fun isAlwaysShowPlus(): Boolean = true
    override fun isAlwaysLeaf(): Boolean = false

    override fun getChildren(): List<AwsExplorerNode<*>> = super<ResourceParentNode>.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = nodeProject
        .getResourceNow(EcrResources.listTags(repository.repositoryName))
        .map { EcrTagNode(nodeProject, repository, it) }
}

class EcrTagNode(project: Project, val repository: Repository, val tag: String) : AwsExplorerNode<String>(project, tag, null), ResourceActionNode {
    override fun actionGroupName(): String = "aws.toolkit.explorer.ecr.tag"
    override fun isAlwaysShowPlus(): Boolean = false
    override fun isAlwaysLeaf(): Boolean = true
    override fun getChildren(): List<AbstractTreeNode<*>> = emptyList()
}
