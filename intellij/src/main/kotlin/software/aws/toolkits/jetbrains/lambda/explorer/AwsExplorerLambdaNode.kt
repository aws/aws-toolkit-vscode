package software.aws.toolkits.jetbrains.lambda.explorer

import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.lambda.model.FunctionConfiguration
import com.amazonaws.services.lambda.model.ListFunctionsRequest
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.ui.LAMBDA_FUNCTION_ICON
import software.aws.toolkits.jetbrains.ui.LAMBDA_SERVICE_ICON
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsTruncatedResultNode

class AwsExplorerLambdaRootNode(project: Project) :
        AwsExplorerServiceRootNode(project, "AWS Lambda", LAMBDA_SERVICE_ICON) {
    override fun serviceName() = "lambda"; // TODO: Get from client in v2

    private val client: AWSLambda = AwsClientManager.getInstance(project).getClient()

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

    private fun mapResourceToNode(resource: FunctionConfiguration) = AwsExplorerFunctionNode(project!!, this, resource)
}

class AwsExplorerFunctionNode(project: Project,
                              serviceNode: AwsExplorerLambdaRootNode,
                              private val function: FunctionConfiguration) :
        AwsExplorerResourceNode<FunctionConfiguration>(project, serviceNode, function, LAMBDA_FUNCTION_ICON) {

    override fun getChildren(): Collection<AbstractTreeNode<Any>> = emptyList()
    override fun resourceName(): String = "function"

    override fun toString(): String = function.functionName
}