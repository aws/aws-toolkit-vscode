// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeModernizerManager
import software.aws.toolkits.resources.message

class CodeModernizerShowActiveJobDetailsAction :
    AnAction(
        message("codemodernizer.explorer.show_active_job_history"),
        message("codemodernizer.explorer.show_active_job_history_description"),
        AllIcons.Vcs.History
    ),
    DumbAware {
    override fun update(event: AnActionEvent) {
        event.presentation.icon = AllIcons.Vcs.History
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        CodeModernizerManager.getInstance(project).showModernizationProgressUI()
    }
}
