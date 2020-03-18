// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.ui.table.JBTable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message

// TODO check resulting file size/ size of log stream and have a pop up if > max editor size
// TODO add progress bar for loading
class OpenLogStreamInEditor(
    private val project: Project,
    private val logGroup: String,
    private val groupTable: JBTable
) :
    AnAction(message("cloudwatch.logs.open_in_editor"), null, AllIcons.Actions.Menu_open),
    CoroutineScope by ApplicationThreadPoolScope("OpenLogStreamInEditor"),
    DumbAware {
    private val edt = getCoroutineUiContext(ModalityState.defaultModalityState())

    override fun actionPerformed(e: AnActionEvent) {
        launch {
            actionPerformedSuspend(e)
        }
    }

    private suspend fun actionPerformedSuspend(e: AnActionEvent) {
        val client: CloudWatchLogsClient = project.awsClient()
        val row = groupTable.selectedRow.takeIf { it >= 0 } ?: return
        val logStream = groupTable.getValueAt(row, 0) as String
        val events = client.getLogEventsPaginator { it.startFromHead(true).logGroupName(logGroup).logStreamName(logStream) }
        val fileContent = events.events().filterNotNull().joinToString("") { if (it.message().endsWith("\n")) it.message() else "${it.message()}\n" }
        OpenStreamInEditor.open(project, edt, logStream, fileContent)
    }
}
