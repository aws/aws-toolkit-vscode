// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.ListFunctionsRequest
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.AwsTruncatedResultNode
import software.aws.toolkits.resources.message
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

class LambdaServiceNode(project: Project) : AwsExplorerServiceRootNode(project, message("lambda.service_name"), AwsIcons.Logos.LAMBDA) {
    override fun serviceName() = LambdaClient.SERVICE_NAME

    private val client: LambdaClient = AwsClientManager.getInstance(project).getClient()

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> {
        val request = ListFunctionsRequest.builder()
        paginationToken?.let { request.marker(paginationToken) }

        val response = client.listFunctions(request.build())
        val resources: MutableList<AwsExplorerNode<*>> =
                response.functions().map { mapResourceToNode(it) }.toMutableList()
        response.nextMarker()?.let {
            resources.add(AwsTruncatedResultNode(this, it))
        }

        return resources
    }

    private fun mapResourceToNode(resource: FunctionConfiguration) = LambdaFunctionNode(project!!, client, this, resource)
}

class LambdaFunctionNode(project: Project, val client: LambdaClient, serviceNode: LambdaServiceNode, private val function: FunctionConfiguration) :
        AwsExplorerResourceNode<FunctionConfiguration>(project, serviceNode, function, AwsIcons.Resources.LAMBDA_FUNCTION) {

    private val editorManager = FileEditorManager.getInstance(project)

    override fun getChildren(): Collection<AbstractTreeNode<Any>> = emptyList()
    override fun onDoubleClick(model: DefaultTreeModel, selectedElement: DefaultMutableTreeNode) {
        val lambdaVirtualFile = LambdaVirtualFile(function.toDataClass(client))
        editorManager.openFile(lambdaVirtualFile, true)
    }

    override fun resourceType(): String = "function"
    override fun toString(): String = functionName()
    fun functionName(): String = function.functionName()
}