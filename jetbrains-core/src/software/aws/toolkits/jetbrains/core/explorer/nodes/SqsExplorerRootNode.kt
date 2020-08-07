// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.jetbrains.services.sqs.SqsServiceNode
import software.aws.toolkits.resources.message

class SqsExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = SqsClient.SERVICE_NAME
    override val displayName: String = message("explorer.node.sqs")

    override fun buildServiceRootNode(project: Project) = SqsServiceNode(project, this)
}
