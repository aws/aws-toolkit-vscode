// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.DumbAwareAction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.aws.toolkits.jetbrains.services.apprunner.ui.CreationDialog
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message

class CreateServiceAction :
    DumbAwareAction(message("apprunner.action.create.service")),
    CoroutineScope by ApplicationThreadPoolScope("AppRunnerCreateServiceAction") {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)
        launch {
            withContext(getCoroutineUiContext()) {
                CreationDialog(project).show()
            }
        }
    }
}
