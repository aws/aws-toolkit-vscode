// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.applications

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import icons.AwsIcons
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.ResourceStatus
import software.amazon.awssdk.services.cloudformation.model.Stack
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerPageableNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.AwsTruncatedResultNode
import software.aws.toolkits.jetbrains.services.cloudformation.LAMBDA_FUNCTION_TYPE
import software.aws.toolkits.jetbrains.services.cloudformation.waitForStackDeletionComplete
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.services.lambda.toDataClass
import software.aws.toolkits.resources.message

class ServerlessApplicationsNode(project: Project) : AwsExplorerPageableNode<String>(project, message("lambda.applications"), null) {

    private val client: CloudFormationClient = AwsClientManager.getInstance(project).getClient()

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> {
        val response = client.describeStacks { request ->
            paginationToken?.let { request.nextToken(it) }
        }

        val nodes = response.stacks().filterNotNull().asSequence()
            .filter { !(it.stackStatus() in DELETING_STACK_STATES) }
            .map { stack -> stack to functionsForStack(stack) }
            .filter { (_, functions) -> functions.isNotEmpty() }
            .map { (stack, functions) ->
                ServerlessApplicationNode(nodeProject, stack.stackName(), stack.stackStatus(), functions.map { it.physicalResourceId() })
            }.toList()

        return nodes + paginationNodeIfRequired(response.nextToken())
    }

    private fun functionsForStack(stack: Stack) =
        client.describeStackResources { it.stackName(stack.stackName()) }
            .stackResources()
            .filter { it.resourceType() == LAMBDA_FUNCTION_TYPE && it.resourceStatus() in COMPLETE_RESOURCE_STATES }

    private fun paginationNodeIfRequired(nextToken: String?) = when {
        nextToken != null -> listOf(AwsTruncatedResultNode(this, nextToken))
        else -> emptyList()
    }

    private companion object {
        val COMPLETE_RESOURCE_STATES = setOf(ResourceStatus.CREATE_COMPLETE, ResourceStatus.UPDATE_COMPLETE)
        val DELETING_STACK_STATES = setOf(StackStatus.DELETE_COMPLETE)
    }
}

class ServerlessApplicationNode(project: Project, val stackName: String, private val stackStatus: StackStatus, val functions: List<String>) :
    AwsExplorerResourceNode<String>(project, LambdaClient.SERVICE_NAME, stackName, AwsIcons.Resources.SERVERLESS_APP) {
    init {
        presentation.forcedTextForeground = when (stackStatus) {
            in FAILED_STACK_STATES -> JBColor.RED
            in IN_PROGRESS_STACK_STATES -> JBColor.ORANGE
            else -> null
        }
        presentation.tooltip = message("lambda.applications.status", stackStatus)
    }
    override fun resourceType() = "application"

    private val client: LambdaClient = project.awsClient()

    @Suppress("UNCHECKED_CAST")
    override fun getChildren(): Collection<AbstractTreeNode<Any>> = when {
        stackStatus in FAILED_STACK_STATES || stackStatus in IN_PROGRESS_STACK_STATES -> emptyList()
        else -> functions.asSequence().map { fn -> client.getFunctionConfiguration { it.functionName(fn) }.toDataClass(credentialProvider.id, region) }.map {
            ServerlessFunctionNode(nodeProject, client, it)
        }.toList() as Collection<AbstractTreeNode<Any>>
    }

    override fun statusText(): String? = stackStatus.toString()

    private companion object {
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

class ServerlessFunctionNode(project: Project, client: LambdaClient, function: LambdaFunction) :
    LambdaFunctionNode(project, client, function) {
    override fun resourceType() = "stackFunction"
}

class DeleteApplicationAction : DeleteResourceAction<ServerlessApplicationNode>(message("lambda.application.delete.action")) {
    override fun performDelete(selected: ServerlessApplicationNode) {
        val client: CloudFormationClient = AwsClientManager.getInstance(selected.nodeProject).getClient()
        client.deleteStack { it.stackName(selected.stackName) }
        client.waitForStackDeletionComplete(selected.stackName)
    }
}