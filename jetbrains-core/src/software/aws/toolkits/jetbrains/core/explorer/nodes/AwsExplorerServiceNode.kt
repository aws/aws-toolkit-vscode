// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project

interface AwsExplorerServiceNode {
    val serviceId: String
    val displayName: String
    fun buildServiceRootNode(project: Project): AwsExplorerServiceRootNode
}
