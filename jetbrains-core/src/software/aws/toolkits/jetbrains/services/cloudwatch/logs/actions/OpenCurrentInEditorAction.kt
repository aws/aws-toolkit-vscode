// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.asContextElement
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry

class OpenCurrentInEditorAction(
    private val project: Project,
    private val logStream: String,
    private val tableEntries: () -> List<LogStreamEntry>
) : AnAction(message("cloudwatch.logs.open_in_editor"), null, AllIcons.Actions.MenuOpen),
    DumbAware {
    private val coroutineScope = projectCoroutineScope(project)

    override fun actionPerformed(e: AnActionEvent) {
        val modality = e.dataContext.getData(PlatformDataKeys.CONTEXT_COMPONENT)?.let { ModalityState.stateForComponent(it) }
            ?: ModalityState.defaultModalityState()

        coroutineScope.launch(modality.asContextElement()) {
            val success = OpenStreamInEditor.open(project, logStream, tableEntries().buildStringFromLogs())
            CloudwatchlogsTelemetry.viewCurrentMessagesInEditor(project, success = success, value = tableEntries().size.toDouble())
        }
    }
}
