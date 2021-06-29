// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.ecs.EcsServiceNode
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.jetbrains.settings.EcsExecCommandSettings
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message

class EnableEcsExecuteCommand :
    SingleResourceNodeAction<EcsServiceNode>(message("ecs.execute_command_enable"), null) {
    private val coroutineScope = ApplicationThreadPoolScope("EnableExecuteCommand")
    private val settings = EcsExecCommandSettings.getInstance()

    override fun actionPerformed(selected: EcsServiceNode, e: AnActionEvent) {
        if (!settings.showExecuteCommandWarning ||
            EnableDisableExecuteCommandWarning(selected.nodeProject, enable = true, selected.value.serviceName()).showAndGet()
        ) {
            coroutineScope.launch {
                enableExecuteCommand(selected.nodeProject, selected.value)
            }
        }
    }

    override fun update(selected: EcsServiceNode, e: AnActionEvent) {
        e.presentation.isVisible = !selected.executeCommandEnabled() && !EcsUtils.isInstrumented(selected.value.serviceArn()) && AwsToolkit.isEcsExecEnabled()
    }

    private fun enableExecuteCommand(project: Project, service: Service) {
        EcsExecUtils.updateExecuteCommandFlag(project, service, enabled = true)
    }
}
