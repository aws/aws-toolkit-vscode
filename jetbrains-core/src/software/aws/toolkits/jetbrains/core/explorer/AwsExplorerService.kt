package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.services.lambda.LambdaServiceNode

enum class AwsExplorerService(val serviceId: String) {
    LAMBDA(LambdaClient.SERVICE_NAME) {
        override fun buildServiceRootNode(project: Project): LambdaServiceNode {
            return LambdaServiceNode(project)
        }
    },
    ;

    abstract fun buildServiceRootNode(project: Project): AbstractTreeNode<String>
}