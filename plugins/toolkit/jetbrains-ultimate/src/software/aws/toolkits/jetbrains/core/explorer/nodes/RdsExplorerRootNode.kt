// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.rds.RdsClient
import software.aws.toolkits.jetbrains.services.rds.RdsExplorerParentNode

class RdsExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = RdsClient.SERVICE_NAME
    override fun buildServiceRootNode(project: Project): AwsExplorerNode<*> = RdsExplorerParentNode(project, this)
}
