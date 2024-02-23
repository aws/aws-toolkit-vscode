// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.experiments

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.resources.message

class ExperimentsActionGroup : DefaultActionGroup(message("aws.toolkit.experimental.title"), true), DumbAware {
    override fun getChildren(e: AnActionEvent?): Array<AnAction> =
        ToolkitExperimentManager.visibleExperiments().map { EnableExperimentAction(it) }.toTypedArray()

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = ToolkitExperimentManager.visibleExperiments().isNotEmpty()
    }
}

class EnableExperimentAction(private val experiment: ToolkitExperiment) : ToggleAction(experiment.title, experiment.description, null), DumbAware {
    override fun isSelected(e: AnActionEvent): Boolean = experiment.isEnabled()
    override fun setSelected(e: AnActionEvent, state: Boolean) = experiment.setState(state)
}
