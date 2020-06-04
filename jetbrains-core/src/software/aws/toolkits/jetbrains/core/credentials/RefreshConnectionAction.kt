// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.resources.message

class RefreshConnectionAction(text: String = message("settings.refresh.description")) : AnAction(text, null, AllIcons.Actions.Refresh), DumbAware {
    override fun update(e: AnActionEvent) {
        val project = e.project ?: return
        e.presentation.isEnabled = when (val state = ProjectAccountSettingsManager.getInstance(project).connectionState) {
            is ConnectionState.IncompleteConfiguration -> false
            else -> state.isTerminal
        }
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        AwsResourceCache.getInstance(project).clear()
        ProjectAccountSettingsManager.getInstance(project).refreshConnectionState()
    }
}
