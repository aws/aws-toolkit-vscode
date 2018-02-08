package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.services.lambda.LambdaServiceNode
import software.aws.toolkits.jetbrains.services.s3.S3ServiceNode

enum class AwsExplorerService(val serviceId: String) {
    S3(S3Client.SERVICE_NAME) {
        override fun buildServiceRootNode(project: Project): S3ServiceNode {
            return S3ServiceNode(project)
        }
    },
    LAMBDA(LambdaClient.SERVICE_NAME) {
        override fun buildServiceRootNode(project: Project): LambdaServiceNode {
            return LambdaServiceNode(project)
        }
    },
    ;

    abstract fun buildServiceRootNode(project: Project): AbstractTreeNode<String>
}