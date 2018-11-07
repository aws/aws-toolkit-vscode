// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.applications

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerPageableNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.AwsTruncatedResultNode
import software.aws.toolkits.jetbrains.services.cloudformation.LAMBDA_FUNCTION_TYPE
import software.aws.toolkits.resources.message

class ServerlessApplicationsNode(project: Project) : AwsExplorerPageableNode<String>(project, message("lambda.applications"), null) {

    private val client: CloudFormationClient = AwsClientManager.getInstance(project).getClient()

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> {
        val response = client.describeStacks { request ->
            paginationToken?.let { request.nextToken(it) }
        }

        val nodes = response.stacks().filterNotNull().filter { stack ->
            client.describeStackResources { it.stackName(stack.stackName()) }.stackResources().any { it.resourceType() == LAMBDA_FUNCTION_TYPE }
        }.map {
            ServerlessApplicationNode(nodeProject, it.stackName())
        }

        return nodes + paginationNodeIfRequired(response.nextToken())
    }

    private fun paginationNodeIfRequired(nextToken: String?) = when {
        nextToken != null -> listOf(AwsTruncatedResultNode(this, nextToken))
        else -> emptyList()
    }
}

class ServerlessApplicationNode(project: Project, val stackName: String) :
    AwsExplorerResourceNode<String>(project, LambdaClient.SERVICE_NAME, "application", stackName, AwsIcons.Resources.SERVERLESS_APP)

class DeleteApplicationAction : DeleteResourceAction<ServerlessApplicationNode>(message("lambda.application.delete.action")) {
    override fun performDelete(selected: ServerlessApplicationNode) {
        val client: CloudFormationClient = AwsClientManager.getInstance(selected.nodeProject).getClient()
        client.deleteStack { it.stackName(selected.stackName) }
    }
}