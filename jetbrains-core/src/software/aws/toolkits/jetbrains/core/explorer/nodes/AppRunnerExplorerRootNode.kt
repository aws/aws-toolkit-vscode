// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.apprunner.AppRunnerClient
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerNode

class AppRunnerExplorerRootNode : AwsExplorerServiceNode {
    override val serviceId: String = AppRunnerClient.SERVICE_NAME

    override fun buildServiceRootNode(project: Project) = AppRunnerNode(project, this)
}
