package com.amazonaws.intellij.ui.explorer

import com.amazonaws.intellij.lambda.explorer.AwsExplorerLambdaRootNode
import com.amazonaws.intellij.s3.explorer.AwsExplorerS3RootNode
import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.s3.AmazonS3
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project

/**
 * Created by zhaoxiz on 7/27/17.
 */
enum class AwsExplorerService(val serviceId: String) {
    S3(AmazonS3.ENDPOINT_PREFIX) {
        override fun buildServiceRoodNode(project: Project?, region: String): AwsExplorerS3RootNode {
            return AwsExplorerS3RootNode(project, region)
        }
    },
    LAMBDA(AWSLambda.ENDPOINT_PREFIX) {
        override fun buildServiceRoodNode(project: Project?, region: String): AwsExplorerLambdaRootNode {
            return AwsExplorerLambdaRootNode(project, region)
        }
    },
    ;

    abstract fun buildServiceRoodNode(project: Project?, region: String): AbstractTreeNode<String>
}