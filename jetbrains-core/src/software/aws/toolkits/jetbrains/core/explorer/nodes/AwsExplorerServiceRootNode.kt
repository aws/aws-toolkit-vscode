// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project

/**
 * Top level node for any AWS service node
 */
abstract class AwsExplorerServiceRootNode(project: Project, value: String) :
    AwsExplorerPageableNode<String>(project, value, null) {

    abstract fun serviceName(): String
}