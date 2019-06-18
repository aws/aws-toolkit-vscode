// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.ResourceStatus
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.AwsNodeAlwaysExpandable
import software.aws.toolkits.jetbrains.core.explorer.AwsTruncatedResultNode
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.services.lambda.toDataClass
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.jetbrains.utils.toHumanReadable
import software.aws.toolkits.resources.message

class CloudFormationServiceNode(project: Project) : AwsExplorerServiceRootNode(project, message("explorer.node.cloudformation")) {
    override fun serviceName() = CloudFormationClient.SERVICE_NAME

    private val client: CloudFormationClient = AwsClientManager.getInstance(project).getClient()

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> {
        val response = client.describeStacks { request ->
            paginationToken?.let { request.nextToken(it) }
        }

        val nodes = response.stacks().filterNotNull().asSequence()
            .filter { it.stackStatus() !in DELETING_STACK_STATES }
            .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.stackName() })
            .map { CloudFormationStackNode(nodeProject, it.stackName(), it.stackStatus(), it.stackId()) }
            .toList()

        return nodes + paginationNodeIfRequired(response.nextToken())
    }

    private fun paginationNodeIfRequired(nextToken: String?) = when {
        nextToken != null -> listOf(AwsTruncatedResultNode(this, nextToken))
        else -> emptyList()
    }

    private companion object {
        val DELETING_STACK_STATES = setOf(StackStatus.DELETE_COMPLETE)
    }
}

class CloudFormationStackNode(project: Project, val stackName: String, private val stackStatus: StackStatus, val stackId: String) :
    AwsExplorerResourceNode<String>(project, CloudFormationClient.SERVICE_NAME, stackName, AwsIcons.Resources.CLOUDFORMATION_STACK),
    AwsNodeAlwaysExpandable {
    override fun resourceType() = "stack"

    override fun resourceArn() = stackId

    override fun displayName() = stackName

    private val cfnClient: CloudFormationClient = project.awsClient()

    /**
     * CloudFormation Stack Nodes do not immediately query for stack resources.
     * We wait until node will be expanded before querying, reducing risk of triggering TPS limits.
     */
    private val noResourcesChildren: Collection<AbstractTreeNode<Any>> = listOf(AwsExplorerEmptyNode(project, message("explorer.stack.no.serverless.resources"))).filterIsInstance<AbstractTreeNode<Any>>()
    private var cachedChildren: Collection<AbstractTreeNode<Any>> = emptyList()

    var isChildCacheInInitialState: Boolean = true
        private set

    override fun isAlwaysLeaf() = false

    /**
     * Children are cached by default to prevent describeStackResources from being called each time a stack node is expanded.
     */
    override fun getChildren(): Collection<AbstractTreeNode<Any>> {
        if (isChildCacheInInitialState) {
            updateCachedChildren()
        }

        return cachedChildren
    }

    private fun updateCachedChildren() {
        cachedChildren = if (stackStatus in FAILED_STACK_STATES || stackStatus in IN_PROGRESS_STACK_STATES) {
            emptyList()
        } else {
            val loaded = loadServerlessStackResources()

            if (loaded.isEmpty()) {
                noResourcesChildren
            } else {
                loaded.filterIsInstance<AbstractTreeNode<Any>>()
            }
        }

        isChildCacheInInitialState = false
    }

    private fun loadServerlessStackResources(): List<AwsExplorerNode<*>> = try {
        cfnClient
            .describeStackResources { it.stackName(stackName) }
            .stackResources()
            .filter { it.resourceType() == LAMBDA_FUNCTION_TYPE && it.resourceStatus() in COMPLETE_RESOURCE_STATES }
            .map { resource ->
                // TODO: Enable using cache, and a registry for these mappings of CFN -> real resource
                val client = project!!.awsClient<LambdaClient>(credentialProvider, region)
                val response = client.getFunction { it.functionName(resource.physicalResourceId()) }

                LambdaFunctionNode(
                    nodeProject,
                    client,
                    response.configuration().toDataClass(credentialProvider.id, region),
                    true
                )
            }
            .toList()
    } catch (e: Exception) {
        listOf(AwsExplorerErrorNode(project!!, e))
    }

    override fun statusText(): String? = stackStatus.toString().toHumanReadable()

    private companion object {
        val COMPLETE_RESOURCE_STATES = setOf(ResourceStatus.CREATE_COMPLETE, ResourceStatus.UPDATE_COMPLETE)
        val FAILED_STACK_STATES = setOf(StackStatus.CREATE_FAILED, StackStatus.DELETE_FAILED, StackStatus.ROLLBACK_FAILED)
        val IN_PROGRESS_STACK_STATES = setOf(
            StackStatus.CREATE_IN_PROGRESS,
            StackStatus.DELETE_IN_PROGRESS,
            StackStatus.ROLLBACK_IN_PROGRESS,
            StackStatus.UPDATE_IN_PROGRESS,
            StackStatus.UPDATE_ROLLBACK_IN_PROGRESS
        )
    }
}

class DeleteCloudFormationStackAction : DeleteResourceAction<CloudFormationStackNode>(message("cloudformation.stack.delete.action"), TaggingResourceType.CLOUDFORMATION_STACK) {
    override fun performDelete(selected: CloudFormationStackNode) {
        val client: CloudFormationClient = AwsClientManager.getInstance(selected.nodeProject).getClient()
        client.deleteStack { it.stackName(selected.stackName) }
        client.waitForStackDeletionComplete(selected.stackName)
    }
}