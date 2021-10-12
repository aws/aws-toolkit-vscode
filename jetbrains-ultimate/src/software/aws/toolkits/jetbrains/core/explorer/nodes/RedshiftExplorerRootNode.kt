// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.redshift.RedshiftClient
import software.aws.toolkits.jetbrains.services.redshift.RedshiftExplorerParentNode

class RedshiftExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = RedshiftClient.SERVICE_NAME
    override fun buildServiceRootNode(project: Project): AwsExplorerNode<*> = RedshiftExplorerParentNode(project, this)
}
