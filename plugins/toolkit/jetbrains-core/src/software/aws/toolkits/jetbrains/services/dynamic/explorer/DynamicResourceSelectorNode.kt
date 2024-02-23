// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.icons.AllIcons
import com.intellij.ide.projectView.PresentationData
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceSupportedTypes
import software.aws.toolkits.jetbrains.settings.DynamicResourcesConfigurable
import software.aws.toolkits.jetbrains.settings.DynamicResourcesSettings
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DynamicresourceTelemetry

class DynamicResourceSelectorNode(nodeProject: Project) : AwsExplorerNode<Unit>(nodeProject, Unit, AllIcons.Actions.Edit) {
    override fun displayName() = message("explorer.node.other.add_remove")

    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()

    override fun onDoubleClick() {
        ShowSettingsUtil.getInstance().showSettingsDialog(null, DynamicResourcesConfigurable::class.java)
        DynamicresourceTelemetry.selectResources(nodeProject)
    }

    override fun update(presentation: PresentationData) {
        val remaining = DynamicResourceSupportedTypes.getInstance().getSupportedTypes().size - DynamicResourcesSettings.getInstance().selected.size
        presentation.tooltip = message("dynamic_resources.add_remove_resources_tooltip", remaining)
    }
}
