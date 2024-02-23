// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.apprunner.ui.CreationDialog
import software.aws.toolkits.resources.message

class CreateServiceAction : DumbAwareAction(message("apprunner.action.create.service")) {
    override fun actionPerformed(e: AnActionEvent) {
        CreationDialog(e.getRequiredData(PlatformDataKeys.PROJECT)).show()
    }
}
