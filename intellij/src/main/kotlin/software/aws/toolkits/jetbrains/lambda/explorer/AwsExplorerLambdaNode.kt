package software.aws.toolkits.jetbrains.lambda.explorer

import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.lambda.model.FunctionConfiguration
import com.amazonaws.services.lambda.model.ListFunctionsRequest
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.AwsClientFactory
import software.aws.toolkits.jetbrains.ui.LAMBDA_SERVICE_ICON
import software.aws.toolkits.jetbrains.ui.SQS_QUEUE_ICON
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsTruncatedResultNode

class AwsExplorerLambdaRootNode(project: Project, profile: String, region: String) :
        AwsExplorerServiceRootNode(project, "AWS Lambda", LAMBDA_SERVICE_ICON) {

    private val client: AWSLambda = AwsClientFactory.getInstance(project).getLambdaClient(profile, region)

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> {
        val request = ListFunctionsRequest()
        paginationToken?.let { request.withMarker(paginationToken) }

        val response = client.listFunctions(request)
        val resources: MutableList<AwsExplorerNode<*>> = response.functions.map { mapResourceToNode(it) }.toMutableList()
        response.nextMarker?.let {
            resources.add(AwsTruncatedResultNode(this, it))
        }

        return resources
    }

    private fun mapResourceToNode(resource: FunctionConfiguration) = AwsExplorerFunctionNode(project!!, resource)
}

class AwsExplorerFunctionNode(project: Project, private val function: FunctionConfiguration) :
        AwsExplorerNode<FunctionConfiguration>(project, function, SQS_QUEUE_ICON) { //TODO replace to Function icon

    override fun getChildren(): Collection<AbstractTreeNode<Any>> {
        return emptyList()
    }

    override fun toString(): String {
        return function.functionName
    }
}