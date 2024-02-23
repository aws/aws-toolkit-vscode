// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeModernizerManager
import software.aws.toolkits.resources.message

class CodeModernizerShowTransformationPlanAction :
    AnAction(
        message("codemodernizer.explorer.show_transformation_plan_title"),
        null,
        AllIcons.Actions.Annotate
    ),
    DumbAware {
    override fun update(event: AnActionEvent) {
        val project = event.project ?: return
        val codeModernizerManager = CodeModernizerManager.getInstance(project)
        event.presentation.isEnabled = codeModernizerManager.getTransformationPlan() != null
        event.presentation.icon = AllIcons.Actions.Annotate
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        CodeModernizerManager.getInstance(project).showTransformationPlan()
    }
}
