// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.services.s3.S3ServiceNode
import software.aws.toolkits.resources.message

class S3ExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = S3Client.SERVICE_NAME
    override val displayName: String = message("explorer.node.s3")

    override fun buildServiceRootNode(project: Project) = S3ServiceNode(project, this)
}
