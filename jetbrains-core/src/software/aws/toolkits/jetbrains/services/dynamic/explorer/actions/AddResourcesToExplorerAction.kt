// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.settings.DynamicResourcesConfigurable
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DynamicresourceTelemetry

class AddResourcesToExplorerAction : DumbAwareAction(
    { message("explorer.node.other.add_remove") },
    AllIcons.Actions.Edit
) {
    override fun actionPerformed(e: AnActionEvent) {
        ShowSettingsUtil.getInstance().showSettingsDialog(null, DynamicResourcesConfigurable::class.java)
        DynamicresourceTelemetry.selectResources(e.project)
    }
}
