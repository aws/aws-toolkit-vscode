// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.schemas.SchemasClient
import software.aws.toolkits.jetbrains.services.schemas.SchemasServiceNode
import software.aws.toolkits.resources.message

class SchemasExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = SchemasClient.SERVICE_NAME
    override val displayName: String = message("explorer.node.schemas")

    override fun buildServiceRootNode(project: Project) = SchemasServiceNode(project, this)
}
