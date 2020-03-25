// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.resources.message

class ExportActionGroup(
    private val project: Project,
    private val client: CloudWatchLogsClient,
    private val logGroup: String,
    private val logStream: () -> String?
) : ActionGroup(message("cloudwatch.logs.export"), null, AllIcons.Actions.Download), DumbAware {
    init {
        isPopup = true
    }

    override fun getChildren(e: AnActionEvent?): Array<AnAction> = arrayOf(
        OpenLogStreamInEditorAction(project, client, logGroup, logStream()),
        DownloadLogStreamToFileAction(project, client, logGroup, logStream())
    )
}
