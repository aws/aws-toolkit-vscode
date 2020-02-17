// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import javax.swing.Icon

/**
 * Top level class for a node that represents a resource such as an AWS Lambda.
 */
abstract class AwsExplorerResourceNode<T>(
    project: Project,
    val serviceId: String,
    value: T,
    awsIcon: Icon
) : AwsExplorerNode<T>(project, value, awsIcon),
    ResourceActionNode {
    override fun actionGroupName() = "aws.toolkit.explorer.$serviceId.${resourceType()}"

    override fun isAlwaysLeaf(): Boolean = true

    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()

    abstract fun resourceType(): String

    abstract fun resourceArn(): String
}
