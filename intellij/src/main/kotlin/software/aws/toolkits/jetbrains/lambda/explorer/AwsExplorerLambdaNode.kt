package software.aws.toolkits.jetbrains.lambda.explorer

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.ListFunctionsRequest
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

    private val client: LambdaClient = AwsClientManager.getInstance(project).getClient()

    override fun loadResources(paginationToken: String?): Collection<AwsExplorerNode<*>> {
        val request = ListFunctionsRequest.builder()
        paginationToken?.let { request.marker(paginationToken) }

        val response = client.listFunctions(request.build())
        val resources: MutableList<AwsExplorerNode<*>> = response.functions().map { mapResourceToNode(it) }.toMutableList()
        response.nextMarker()?.let {
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
    override fun toString(): String = function.functionName()
}