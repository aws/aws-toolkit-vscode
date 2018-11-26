// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.project.Project
import com.intellij.psi.NavigatablePsiElement
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.ListFunctionsRequest
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.AwsNodeAlwaysExpandable
import software.aws.toolkits.jetbrains.core.explorer.AwsTruncatedResultNode
import software.aws.toolkits.resources.message

class LambdaServiceNode(project: Project) : AwsExplorerServiceRootNode(project, message("explorer.node.lambda")),
    AwsNodeAlwaysExpandable {
    override fun serviceName() = LambdaClient.SERVICE_NAME

    private val client: LambdaClient = AwsClientManager.getInstance(project).getClient()

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> {
        val request = ListFunctionsRequest.builder()
        paginationToken?.let { request.marker(paginationToken) }

        val response = client.listFunctions(request.build())
        val resources: MutableList<AwsExplorerNode<*>> =
            response.functions().asSequence().sortedBy { it.functionName().toLowerCase() }.map { mapResourceToNode(it) }.toMutableList()
        response.nextMarker()?.let {
            resources.add(AwsTruncatedResultNode(this, it))
        }

        return resources
    }

    private fun mapResourceToNode(resource: FunctionConfiguration) = LambdaFunctionNode(project!!, client, resource.toDataClass(credentialProvider.id, region))
}

open class LambdaFunctionNode(
    project: Project,
    val client: LambdaClient,
    val function: LambdaFunction
) : AwsExplorerResourceNode<LambdaFunction>(project, LambdaClient.SERVICE_NAME, function, AwsIcons.Resources.LAMBDA_FUNCTION) {
    override fun resourceType() = "function"

    override fun toString(): String = functionName()

    override fun displayName() = functionName()

    override fun isAlwaysLeaf() = true

    fun functionName(): String = function.name

    fun handlerPsi(): Array<NavigatablePsiElement> = Lambda.findPsiElementsForHandler(super.getProject()!!, function.runtime, function.handler)
}