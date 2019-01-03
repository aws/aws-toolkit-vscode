// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationServiceNode
import software.aws.toolkits.jetbrains.services.lambda.LambdaServiceNode

enum class AwsExplorerService(val serviceId: String) {
    CLOUDFORMATION(CloudFormationClient.SERVICE_NAME) {
        override fun buildServiceRootNode(project: Project): CloudFormationServiceNode = CloudFormationServiceNode(project)
    },
    LAMBDA(LambdaClient.SERVICE_NAME) {
        override fun buildServiceRootNode(project: Project): LambdaServiceNode = LambdaServiceNode(project)
    },
    ;

    abstract fun buildServiceRootNode(project: Project): AbstractTreeNode<String>
}