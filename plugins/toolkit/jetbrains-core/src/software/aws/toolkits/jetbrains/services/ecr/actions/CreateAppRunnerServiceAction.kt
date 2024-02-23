// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.apprunner.ui.CreationDialog
import software.aws.toolkits.jetbrains.services.ecr.EcrTagNode
import software.aws.toolkits.resources.message

class CreateAppRunnerServiceAction :
    SingleExplorerNodeAction<EcrTagNode>(message("ecr.create.app_runner_service.action"), null, null),
    DumbAware {
    override fun actionPerformed(selected: EcrTagNode, e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)
        CreationDialog(project, "${selected.repository.repositoryUri}:${selected.tag}").show()
    }
}
