package software.aws.toolkits.jetbrains.lambda.explorer

import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.lambda.model.FunctionConfiguration
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.AwsClientFactory
import software.aws.toolkits.jetbrains.ui.LAMBDA_FUNCTION_ICON
import software.aws.toolkits.jetbrains.ui.LAMBDA_SERVICE_ICON
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerNode
import software.aws.toolkits.jetbrains.ui.explorer.AwsExplorerServiceRootNode

class AwsExplorerLambdaRootNode(project: Project, profile: String, region: String):
        AwsExplorerServiceRootNode<FunctionConfiguration>(project, "AWS Lambda", profile, region, LAMBDA_SERVICE_ICON) {

    private val client: AWSLambda = AwsClientFactory.getInstance(project).getLambdaClient(profile, region)

    override fun loadResources(): Collection<FunctionConfiguration> {
        //TODO We need to list all the functions, not just one page
        return client.listFunctions().functions
    }

    override fun mapResourceToNode(resource: FunctionConfiguration) = AwsExplorerFunctionNode(project!!, resource, profile, region)
}

class AwsExplorerFunctionNode(project: Project, private val function: FunctionConfiguration, profile: String, region: String):
        AwsExplorerNode<FunctionConfiguration>(project, function, profile, region, LAMBDA_FUNCTION_ICON) {

    override fun getChildren(): Collection<AbstractTreeNode<Any>> {
        return emptyList()
    }

    override fun toString(): String {
        return function.functionName
    }
}