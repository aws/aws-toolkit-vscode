package com.amazonaws.intellij.lambda.explorer

import com.amazonaws.intellij.ui.LAMBDA_SERVICE_ICON
import com.amazonaws.intellij.ui.SQS_QUEUE_ICON
import com.amazonaws.intellij.ui.explorer.AwsExplorerNode
import com.amazonaws.intellij.ui.explorer.AwsExplorerServiceRootNode
import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.lambda.AWSLambdaClientBuilder
import com.amazonaws.services.lambda.model.FunctionConfiguration
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project

/**
 * Created by zhaoxiz on 7/28/17.
 */
class AwsExplorerLambdaRootNode(project: Project, region: String):
        AwsExplorerServiceRootNode<FunctionConfiguration>(project, "AWS Lambda", region, LAMBDA_SERVICE_ICON) {

    //TODO we need to move to ClientFactory for initializing service client
    private val client: AWSLambda = AWSLambdaClientBuilder.standard()
            .withRegion(region)
            .build()

    override fun loadResources(): Collection<FunctionConfiguration> {
        //TODO We need to list all the functions, not just one page
        return client.listFunctions().functions
    }

    override fun mapResourceToNode(resource: FunctionConfiguration) = AwsExplorerFunctionNode(project!!, resource, region)
}

class AwsExplorerFunctionNode(project: Project, private val function: FunctionConfiguration, region: String):
        AwsExplorerNode<FunctionConfiguration>(project, function, region, SQS_QUEUE_ICON) { //TODO replace to Function icon

    override fun getChildren(): Collection<AbstractTreeNode<Any>> {
        return emptyList()
    }

    override fun toString(): String {
        return function.functionName
    }
}