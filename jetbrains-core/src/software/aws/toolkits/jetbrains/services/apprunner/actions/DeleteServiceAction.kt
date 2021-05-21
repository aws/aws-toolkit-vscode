// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import software.amazon.awssdk.services.apprunner.AppRunnerClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode
import software.aws.toolkits.jetbrains.services.apprunner.resources.AppRunnerResources
import software.aws.toolkits.resources.message

class DeleteServiceAction : DeleteResourceAction<AppRunnerServiceNode>(message("apprunner.action.delete.service")) {
    override fun performDelete(selected: AppRunnerServiceNode) {
        val client = selected.nodeProject.awsClient<AppRunnerClient>()
        client.deleteService { it.serviceArn(selected.resourceArn()) }
        selected.nodeProject.refreshAwsTree(AppRunnerResources.LIST_SERVICES)
    }
}
