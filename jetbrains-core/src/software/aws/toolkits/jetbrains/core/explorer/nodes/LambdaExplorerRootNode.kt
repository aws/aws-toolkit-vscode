// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.services.lambda.LambdaServiceNode
import software.aws.toolkits.resources.message

class LambdaExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = LambdaClient.SERVICE_NAME
    override val displayName: String = message("explorer.node.lambda")

    override fun buildServiceRootNode(project: Project) = LambdaServiceNode(project, this)
}
