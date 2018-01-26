package software.aws.toolkits.jetbrains.ui.explorer

import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.s3.AmazonS3
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.lambda.explorer.AwsExplorerLambdaRootNode
import software.aws.toolkits.jetbrains.s3.explorer.AwsExplorerS3RootNode

enum class AwsExplorerService(val serviceId: String) {
    S3(AmazonS3.ENDPOINT_PREFIX) {
        override fun buildServiceRootNode(project: Project, profile: String, region: String): AwsExplorerS3RootNode {
            return AwsExplorerS3RootNode(project, profile, region)
        }
    },
    LAMBDA(AWSLambda.ENDPOINT_PREFIX) {
        override fun buildServiceRootNode(project: Project, profile: String, region: String): AwsExplorerLambdaRootNode {
            return AwsExplorerLambdaRootNode(project, profile, region)
        }
    },
    ;

    abstract fun buildServiceRootNode(project: Project, profile: String, region: String): AbstractTreeNode<String>
}