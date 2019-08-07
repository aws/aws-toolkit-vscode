// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.project.Project
import com.intellij.psi.NavigatablePsiElement
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerService
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.services.lambda.resources.LambdaResources

class LambdaServiceNode(project: Project) : AwsExplorerServiceRootNode(project, AwsExplorerService.LAMBDA) {
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = AwsResourceCache.getInstance(nodeProject)
        .getResourceNow(LambdaResources.LIST_FUNCTIONS)
        .map { LambdaFunctionNode(nodeProject, it.toDataClass(credentialProvider.id, region)) }
}

open class LambdaFunctionNode(
    project: Project,
    function: LambdaFunction,
    immutable: Boolean = false
) : AwsExplorerResourceNode<LambdaFunction>(
    project,
    LambdaClient.SERVICE_NAME,
    function,
    AwsIcons.Resources.LAMBDA_FUNCTION,
    immutable
) {
    override fun resourceType() = "function"

    override fun resourceArn() = value.arn

    override fun toString(): String = functionName()

    override fun displayName() = functionName()

    fun functionName(): String = value.name

    fun handlerPsi(): Array<NavigatablePsiElement> =
        Lambda.findPsiElementsForHandler(nodeProject, value.runtime, value.handler)
}