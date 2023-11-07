// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.asContextElement
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamDownloadTask
import software.aws.toolkits.resources.message

class OpenLogStreamInEditorAction(
    private val project: Project,
    private val client: CloudWatchLogsClient,
    private val logGroup: String,
    private val logStream: String?
) : AnAction(message("cloudwatch.logs.open_in_editor"), null, AllIcons.Actions.MenuOpen), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        logStream ?: return
        val modality = e.dataContext.getData(PlatformDataKeys.CONTEXT_COMPONENT)?.let { ModalityState.stateForComponent(it) }
            ?: ModalityState.defaultModalityState()

        ProgressManager.getInstance().run(LogStreamDownloadTask(project, modality.asContextElement(), client, logGroup, logStream))
    }
}
