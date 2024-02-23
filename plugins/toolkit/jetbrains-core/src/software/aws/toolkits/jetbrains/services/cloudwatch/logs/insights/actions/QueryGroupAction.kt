// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogsNode
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.QueryEditorDialog
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchinsightsTelemetry
import software.aws.toolkits.telemetry.InsightsDialogOpenSource

class QueryGroupAction : SingleResourceNodeAction<CloudWatchLogsNode>(message("cloudwatch.logs.open_query_editor")), DumbAware {
    override fun actionPerformed(selected: CloudWatchLogsNode, e: AnActionEvent) {
        val project = selected.nodeProject

        QueryEditorDialog(
            project,
            ConnectionSettings(project.activeCredentialProvider(), project.activeRegion()),
            selected.logGroupName
        ).show()
        CloudwatchinsightsTelemetry.openEditor(project, InsightsDialogOpenSource.Explorer)
    }
}
