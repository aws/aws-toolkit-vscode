// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.ecs.EcsExecExperiment
import software.aws.toolkits.jetbrains.services.ecs.EcsServiceNode
import software.aws.toolkits.jetbrains.settings.EcsExecCommandSettings
import software.aws.toolkits.resources.message

class DisableEcsExecuteCommand :
    SingleResourceNodeAction<EcsServiceNode>(message("ecs.execute_command_disable"), null) {
    private val settings = EcsExecCommandSettings.getInstance()
    override fun actionPerformed(selected: EcsServiceNode, e: AnActionEvent) {
        if (!settings.showExecuteCommandWarning ||
            EnableDisableExecuteCommandWarning(selected.nodeProject, enable = false, selected.value.serviceName()).showAndGet()
        ) {
            val coroutineScope = projectCoroutineScope(selected.nodeProject)
            coroutineScope.launch {
                disableExecuteCommand(selected.nodeProject, selected.value)
            }
        }
    }

    override fun update(selected: EcsServiceNode, e: AnActionEvent) {
        e.presentation.isVisible = selected.executeCommandEnabled() && EcsExecExperiment.isEnabled()
    }

    private fun disableExecuteCommand(project: Project, service: Service) {
        EcsExecUtils.updateExecuteCommandFlag(project, service, enabled = false)
    }
}
