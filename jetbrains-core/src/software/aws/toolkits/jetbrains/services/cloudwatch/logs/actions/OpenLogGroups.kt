// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogsNode
import software.aws.toolkits.resources.message

class OpenLogGroups : SingleResourceNodeAction<CloudWatchLogsNode>(message("cloudwatch.log.open")), DumbAware {
    override fun actionPerformed(selected: CloudWatchLogsNode, e: AnActionEvent) {
        // TODO subsequent PRs will fill this in
        println("this will open the window")
    }
}
