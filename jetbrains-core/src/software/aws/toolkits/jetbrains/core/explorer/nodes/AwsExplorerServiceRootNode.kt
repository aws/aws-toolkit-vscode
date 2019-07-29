// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerService

/**
 * Top level node for any AWS service node
 */
abstract class AwsExplorerServiceRootNode(project: Project, private val service: AwsExplorerService) :
    AwsExplorerPageableNode<String>(project, service.displayName, null), AwsNodeAlwaysExpandable {

    val serviceId: String
        get() = service.serviceId
}