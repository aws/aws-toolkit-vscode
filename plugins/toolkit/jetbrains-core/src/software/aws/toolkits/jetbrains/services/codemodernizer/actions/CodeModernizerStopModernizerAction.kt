// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeModernizerManager
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeTransformTelemetryState
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformCancelSrcComponents
import software.aws.toolkits.telemetry.CodetransformTelemetry

class CodeModernizerStopModernizerAction :
    AnAction(
        message("codemodernizer.explorer.stop_migration_job"),
        null,
        AllIcons.Actions.Suspend
    ),
    DumbAware {
    override fun update(event: AnActionEvent) {
        val project = event.project ?: return
        val codeModernizerManager = CodeModernizerManager.getInstance(project)
        event.presentation.isEnabledAndVisible = codeModernizerManager.isModernizationJobActive()
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        CodeModernizerManager.getInstance(project).userInitiatedStopCodeModernization()
        CodetransformTelemetry.jobIsCancelledByUser(
            codeTransformCancelSrcComponents = CodeTransformCancelSrcComponents.BottomPanelSideNavButton,
            codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId()
        )
    }
}
