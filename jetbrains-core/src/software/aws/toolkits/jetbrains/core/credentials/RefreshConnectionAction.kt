// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry

class RefreshConnectionAction(text: String = message("settings.refresh.description")) :
    AnAction(text, null, AllIcons.Actions.Refresh),
    DumbAware {
    override fun update(e: AnActionEvent) {
        val project = e.project ?: return
        e.presentation.isEnabled = when (val state = AwsConnectionManager.getInstance(project).connectionState) {
            is ConnectionState.IncompleteConfiguration -> false
            else -> state.isTerminal
        }
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        AwsTelemetry.refreshExplorer(project)
        val scope = projectCoroutineScope(project)
        scope.launch { AwsResourceCache.getInstance().clear() }
        AwsConnectionManager.getInstance(project).refreshConnectionState()
    }
}
