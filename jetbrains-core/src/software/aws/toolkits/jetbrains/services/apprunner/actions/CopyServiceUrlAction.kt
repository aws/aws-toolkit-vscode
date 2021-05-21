// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ApprunnerTelemetry
import java.awt.datatransfer.StringSelection

class CopyServiceUrlAction : SingleResourceNodeAction<AppRunnerServiceNode>(message("apprunner.action.copyServiceUrl")), DumbAware {
    override fun actionPerformed(selected: AppRunnerServiceNode, e: AnActionEvent) {
        CopyPasteManager.getInstance().setContents(StringSelection(selected.service.serviceUrl()))
        ApprunnerTelemetry.copyServiceUrl(selected.nodeProject)
    }
}
