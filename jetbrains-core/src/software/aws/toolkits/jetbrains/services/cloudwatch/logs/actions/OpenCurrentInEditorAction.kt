// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry

class OpenCurrentInEditorAction(
    private val project: Project,
    private val logStream: String,
    private val tableEntries: () -> List<LogStreamEntry>
) :
    AnAction(message("cloudwatch.logs.open_in_editor"), null, AllIcons.Actions.Menu_open),
    CoroutineScope by ApplicationThreadPoolScope("OpenCurrentInEditorAction"),
    DumbAware {
    private val edt = getCoroutineUiContext()

    override fun actionPerformed(e: AnActionEvent) {
        launch {
            val success = OpenStreamInEditor.open(project, edt, logStream, tableEntries().buildStringFromLogs())
            CloudwatchlogsTelemetry.viewCurrentMessagesInEditor(project, success = success, value = tableEntries().size.toDouble())
        }
    }
}
